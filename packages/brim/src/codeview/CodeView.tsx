import { layoutFunctionDefinitionNode, TreeViewContext } from '../codeview/TreeView';
import { getStaticEnvMap, initStaticEnv } from '../editor/EditorReducer';
import Chooser from '../codeview/Chooser';
import { useLayoutEffect, useRef, useState } from 'react';
import { FunctionDefinitionNode, Node, NodeKind, UID } from '../compiler/Tree';
import globalNativeFunctions from '../builtin/globalNatives';
import './CodeView.css';
import { deleteNode, getNodeIdMap, getNodeParent, insertBeforeOrAfter, replaceNode } from '../compiler/TreeUtil';
import genuid from '../util/uid';
import { computeSeltreeLookups, SeltreeNode } from './Seltree';

const keyActions: ReadonlyArray<[string, ReadonlyArray<string>, boolean, string]> = [
  ['Enter', [], true, 'MODIFY'],
  ['Escape', [], true, 'ABORT_CHOOSER'],
  ['Backspace', [], false, 'DELETE'],
  ['Enter', ['Shift'], true, 'INFIX_EDIT'],
  ['Tab', [], true, 'EDIT_NEXT_UNDEFINED'],
  ['KeyZ', ['Meta'], false, 'UNDO'],
  ['KeyX', ['Meta'], false, 'CUT'],
  ['KeyV', ['Meta'], false, 'PASTE'],
  ['ArrowUp', [], false, 'MOVE_UP'],
  ['ArrowDown', [], false, 'MOVE_DOWN'],
  ['ArrowLeft', [], false, 'MOVE_LEFT'],
  ['ArrowRight', [], false, 'MOVE_RIGHT'],
  ['ArrowUp', ['Shift'], false, 'INSERT_UP'],
  ['ArrowDown', ['Shift'], false, 'INSERT_DOWN'],
  ['ArrowLeft', ['Shift'], false, 'INSERT_LEFT'],
  ['ArrowRight', ['Shift'], false, 'INSERT_RIGHT'],
];

// These are "normal" character keys that we use as commands. We identify them because we don't want
// them to begin an "overwrite edit".
const DONT_START_EDIT_CHARS = new Set([
  '=',
  ',',
]);

function setsEq<T>(as: ReadonlySet<T>, bs: ReadonlySet<T>): boolean {
  if (as.size !== bs.size) {
    return false;
  }

  for (const a of as) {
    if (!bs.has(a)) {
      return false;
    }
  }

  return true;
}

type ChooserMode = 'before' | 'after' | 'new' | 'modify';
interface ChooserState {
  key: UID; // this lets us "reset" chooser if we jump directly to editing a different thing
  mode: ChooserMode;
}

interface CodeViewState {
  readonly selectionId: UID;
  readonly choosing: ChooserState | null;
}

const CodeView: React.FC<{autoFocus: boolean, root: FunctionDefinitionNode, onUpdateRoot: (newRoot: Node) => void}> = ({ autoFocus, root, onUpdateRoot }) => {
  const [state, setState] = useState<CodeViewState>({
    selectionId: root.nid,
    choosing: null,
  });

  const nodeIdToNode = getNodeIdMap(root);

  const setSelectionId = (nid: UID): void => {
    setState(s => ({
      ...s,
      selectionId: nid,
      choosing: null,
    }));
  };

  const moveSelection = (moveFunc: (selId: SeltreeNode) => SeltreeNode | undefined): void => {
    setState(s => {
      const seltreeNode = rootSeltreeLookups.selIdToNode.get(s.selectionId);
      if (!seltreeNode) {
        throw new Error();
      }

      const newSeltreeNode = moveFunc(seltreeNode);

      if (newSeltreeNode === undefined) {
        return s;
      } else {
        if (newSeltreeNode.selId === undefined) {
          throw new Error();
        }
        return {
          ...s,
          selectionId: newSeltreeNode.selId,
          choosing: null,
        };
      }
    });
  };

  const selLastDesc = (node: SeltreeNode): SeltreeNode => {
    if (node.children.length) {
      return selLastDesc(node.children[node.children.length-1]);
    }

    return node;
  };

  const selUpInto = (node: SeltreeNode): SeltreeNode => {
    if (node.selId) {
      return node;
    } else {
      if (node.dir === 'block') {
        return selUpInto(node.children[node.children.length-1]);
      } else {
        return selUpInto(node.children[0]);
      }
    }
  };

  const selFirstSelectableDesc = (node: SeltreeNode): SeltreeNode => {
    if (node.selId) {
      return node;
    } else {
      return selFirstSelectableDesc(node.children[0]);
    }
  };

  const selUpFrom = (node: SeltreeNode): SeltreeNode | undefined => {
    const pidx = rootSeltreeLookups.parentAndIdx.get(node);

    if (!pidx) {
      return undefined;
    }

    const [parent, idx] = pidx;

    if (parent.dir === 'block') {
      if (idx === 0) {
        if (parent.selId) {
          return parent;
        } else {
          return selUpFrom(parent);
        }
      } else {
        const prevSib = parent.children[idx-1];

        return selUpInto(prevSib);
      }
    } else {
      return selUpFrom(parent);
    }
  }

  const selDownFrom = (node: SeltreeNode): SeltreeNode | undefined => {
    const pidx = rootSeltreeLookups.parentAndIdx.get(node);

    if (!pidx) {
      return undefined;
    }

    const [parent, idx] = pidx;

    if (parent.dir === 'block') {
      if (idx === (parent.children.length-1)) {
        return selDownFrom(parent);
      } else {
        const nextSib = parent.children[idx+1];

        return selFirstSelectableDesc(nextSib);
      }
    } else {
      return selDownFrom(parent);
    }
  }

  const selBackFrom = (node: SeltreeNode): SeltreeNode | undefined => {
    const pidx = rootSeltreeLookups.parentAndIdx.get(node);

    if (!pidx) {
      return undefined;
    }

    const [parent, idx] = pidx;

    if (parent.dir === 'block') {
      if (parent.selId !== undefined) {
        return parent;
      } else {
        return selBackFrom(parent);
      }
    } else {
      if (idx === 0) {
        if (parent.selId !== undefined) {
          return parent;
        } else {
          return selBackFrom(parent);
        }
      } else {
        const prevSib = parent.children[idx-1];
        return selLastDesc(prevSib);
      }
    }
  }

  const selNextInlineAfter = (node: SeltreeNode): SeltreeNode | undefined => {
    const pidx = rootSeltreeLookups.parentAndIdx.get(node);

    if (!pidx) {
      return undefined;
    }

    const [parent, idx] = pidx;
    if (parent.dir === 'inline') {
      if (idx === (parent.children.length-1)) {
        return selNextInlineAfter(parent);
      } else {
        const nextSib = parent.children[idx+1];
        return selFirstSelectableDesc(nextSib);
      }
    }
  };

  const selFwdFrom = (node: SeltreeNode): SeltreeNode | undefined => {
    if (node.children.length) {
      return selFirstSelectableDesc(node.children[0]);
    } else {
      return selNextInlineAfter(node);
    }
  }

  const deleteSeletedNode = (): void => {
    // TODO: check if selectionId is for a "placeholder"
    const nodeToDelete = nodeIdToNode.get(state.selectionId);
    if (!nodeToDelete) {
      throw new Error();
    }
    const result = deleteNode(root, nodeToDelete);
    if (result) {
      const [newRoot, newSelectedNode] = result;
      setSelectionId(newSelectedNode.nid);
      onUpdateRoot(newRoot);
    }
  };

  const modifySelectedNode = (): void => {
    setState(s => ({
      ...s,
      choosing: {
        key: genuid(),
        mode: 'modify', // TODO: might be 'new' if pseudo-id
      },
    }));
  };

  const abortChooser = (): void => {
    setState(s => ({
      ...s,
      choosing: null,
    }));
  };

  const insertInDir = (dir: 'up' | 'down' | 'back' | 'fwd'): void => {
    setState(s => {
      const seltreeNode = rootSeltreeLookups.selIdToNode.get(s.selectionId);
      if (!seltreeNode) {
        throw new Error();
      }

      const pidx = rootSeltreeLookups.parentAndIdx.get(seltreeNode);
      if (!pidx) {
        return s;
      }
      const [parent, ] = pidx;

      if (!parent.flags.dyn) {
        return s;
      }

      const chooseInMode = (mode: ChooserMode): CodeViewState => {
        return {
          ...s,
          choosing: {
            key: genuid(),
            mode,
          },
        };
      }

      if (parent.dir === 'block') {
        if (dir === 'up') {
          return chooseInMode('before');
        } else if (dir === 'down') {
          return chooseInMode('after');
        }
      } else {
        if (dir === 'back') {
          return chooseInMode('before');
        } else if (dir === 'fwd') {
          return chooseInMode('after');
        }
      }

      return s;
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // find the set of key modifiers for this press
    const eventMods: Set<string> = new Set();
    for (const m of ['Alt', 'Control', 'Meta', 'Shift']) {
      if (e.getModifierState(m)) {
        eventMods.add(m);
      }
    }

    // was this key entered into an input box?
    const intoInput = (e.target as Element).tagName.toLowerCase() === 'input';

    // hacky, but works. see https://stackoverflow.com/questions/12467240/determine-if-javascript-e-keycode-is-a-printable-non-control-character#comment114613852_58658881
    const printable = [...e.key].length === 1;

    for (const [key, modsArr, handleInInput, action] of keyActions) {
      if ((e.code === key) && setsEq(eventMods, new Set(modsArr)) && (!intoInput || handleInInput)) {
        switch (action) {
          case 'MOVE_UP':
            moveSelection(selUpFrom);
            break;

          case 'MOVE_DOWN':
            moveSelection(selDownFrom);
            break;

          case 'MOVE_LEFT':
            moveSelection(selBackFrom);
            break;

          case 'MOVE_RIGHT':
            moveSelection(selFwdFrom);
            break;

          case 'DELETE':
            deleteSeletedNode();
            break;

          case 'INSERT_UP':
            insertInDir('up');
            break;

          case 'INSERT_DOWN':
            insertInDir('down');
            break;

          case 'INSERT_LEFT':
            insertInDir('back');
            break;

          case 'INSERT_RIGHT':
            insertInDir('fwd');
            break;

          case 'MODIFY':
            modifySelectedNode();
            break;

          case 'ABORT_CHOOSER':
            abortChooser();
            break;
        }

        e.preventDefault();
        return;
      }
    }

    if (!intoInput && printable && ((eventMods.size === 0) || setsEq(eventMods, new Set(['Shift']))) && !DONT_START_EDIT_CHARS.has(e.key)) {
      // Interestingly, the key here will still end up going into the input element, which is what we want.
      modifySelectedNode();
    }
  };

  const handleCommitChoice = (node: Node): void => {
    setState(s => {
      if (!state.choosing) {
        throw new Error();
      }

      // TODO: check if selectionId is for a "placeholder"
      const selectedNode = nodeIdToNode.get(state.selectionId);
      if (!selectedNode) {
        throw new Error();
      }

      if ((state.choosing.mode === 'modify')) {
        const newRoot = replaceNode(root, selectedNode, node);

        onUpdateRoot(newRoot);

        return {
          ...s,
          selectionId: node.nid,
          choosing: null,
        };
      } else if ((state.choosing.mode === 'before') || (state.choosing.mode === 'after')) {
        const newRoot = insertBeforeOrAfter(root, selectedNode, node, (state.choosing.mode === 'before'));

        onUpdateRoot(newRoot);

        return {
          ...s,
          selectionId: node.nid,
          choosing: null,
        };
      } else {
        throw new Error('unimplemented');
      }
    });
  };

  // this shouldn't be repeated every render
  const globalStaticEnv = initStaticEnv(globalNativeFunctions);

  const staticEnvMap = getStaticEnvMap(root, globalStaticEnv);
  // const referentNameNode = getReferentNode(displayedSelTree.selectedNode, displayedStaticEnvMap);

  // Move focus back to workspace after chooser has closed. This is hacky, but don't know better way to handle.
  const rootElem = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  const previouslyChoosing = useRef<boolean>(false);
  const focusWasOnTree: boolean = !!rootElem.current && rootElem.current.contains(document.activeElement);
  const focusWorkspaceNow: boolean = (autoFocus && firstRender.current) || (!state.choosing && (focusWasOnTree || previouslyChoosing.current));
  previouslyChoosing.current = !!state.choosing;
  firstRender.current = false;
  useLayoutEffect(() => {
    if (focusWorkspaceNow && rootElem.current) {
      rootElem.current.focus();
    }
  });

  const treeViewCtx: TreeViewContext = {
    // clipboardTopNode: (state.clipboardStack.length > 0) ? state.derivedLookups.streamIdToNode!.get(state.clipboardStack[state.clipboardStack.length-1].streamId) : null,
    // clipboardRestNodes: state.clipboardStack.slice(0, -1).map(frame => state.derivedLookups.streamIdToNode!.get(frame.streamId)),
    staticEnvMap,
    onSelectNodeId: (nid: UID) => {
      setSelectionId(nid);
    },
  };

  const positionedForChooserKey: React.MutableRefObject<string | undefined> = useRef();
  const selHighlightElem = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const selectedElem = document.querySelector('div[data-nid="' + state.selectionId + '"]');
    if (!selectedElem) {
      throw new Error();
    }
    const selectedElemRect = selectedElem.getBoundingClientRect();
    const selElemTop = selectedElemRect.top + window.scrollY;
    const selElemLeft = selectedElemRect.left + window.scrollX;
    const selElemWidth = selectedElemRect.width;
    const selElemHeight = selectedElemRect.height;

    // Draw node highlights (selection, etc)
    if (!selHighlightElem.current) {
      throw new Error();
    }

    const sheClasses = ['CodeView-selection'];
    // TODO: improve this
    if (selectedElem.classList.contains('TreeView-selectable-common')) {
      sheClasses.push('CodeView-selection-common');
    }
    selHighlightElem.current.className = sheClasses.join(' ');

    const sheStyle = selHighlightElem.current.style;
    sheStyle.top = selElemTop + 'px';
    sheStyle.left = selElemLeft + 'px';
    sheStyle.width = selElemWidth + 'px';
    sheStyle.height = selElemHeight + 'px';

    // Position the chooser
    const chooserKey = state.choosing ? state.choosing.key : undefined;

    if (positionedForChooserKey.current !== chooserKey) {
      // NOTE: Directly referring to these class names is hacky
      const cpElem = document.querySelector('.CodeView-chooser-positioner') as HTMLElement;
      if (cpElem) {
        // const cpRect = cpElem.getBoundingClientRect();
        cpElem.style.left = selElemLeft + 'px';
        cpElem.style.top = (selElemTop + selElemHeight + 2) + 'px';
      }

      positionedForChooserKey.current = chooserKey;
    }
  });

  const {reactNode: rootReactNode, seltree: rootSeltree} = layoutFunctionDefinitionNode(root, treeViewCtx);
  const rootSeltreeLookups = computeSeltreeLookups(rootSeltree);

  return (
    <div className="CodeView" onKeyDown={onKeyDown} ref={rootElem} tabIndex={0}>
      {rootReactNode}
      {state.choosing && (() => {
        let context: 'tdef-body' | 'subexp' | 'text';

        // TODO: make this stuff correct
        const selectedNode = nodeIdToNode.get(state.selectionId);
        if (!selectedNode) {
          throw new Error();
        }
        if (selectedNode.kind === NodeKind.Text) {
          context = 'text';
        } else {
          const parentOfSelectedNode = getNodeParent(selectedNode, root);
          if (parentOfSelectedNode) {
            if (parentOfSelectedNode.kind === NodeKind.TreeImpl) {
              context = 'tdef-body';
            } else if (parentOfSelectedNode.kind === NodeKind.Application) {
              context = 'subexp';
            } else {
              // TODO: this is not right
              context = 'subexp';
            }
          } else {
            // TODO: this is not right
            context = 'subexp';
          }
        }

        const existingNode = (state.choosing.mode === 'modify') ? selectedNode : null;

        const localEnv = staticEnvMap.get(selectedNode);
        if (!localEnv) {
          throw new Error();
        }

        return (
          <div className="CodeView-chooser-positioner" style={{position: 'absolute'}}>
            <Chooser key={state.choosing.key} context={context} existingNode={existingNode} localEnv={localEnv} onCommitChoice={handleCommitChoice} />
          </div>
        );
      })()}
      <div className="CodeView-selection" ref={selHighlightElem} />
    </div>
  );
}

export default CodeView;
