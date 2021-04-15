import { annoFunctionDefinitionView, annoSelectable, TreeViewContext } from '../codeview/TreeView';
import { getStaticEnvMap, getReferentNode, initStaticEnv, deleteNode, replaceNode } from '../editor/EditorReducer';
import Chooser from '../codeview/Chooser';
import { useLayoutEffect, useReducer, useRef, useState } from 'react';
import { FunctionDefinitionNode, Node, NodeKind, UID } from '../compiler/Tree';
import globalNativeFunctions from '../builtin/globalNatives';
import './CodeView.css';
import { getNodeIdMap } from '../compiler/TreeUtil';
import genuid from '../util/uid';

const keyActions: ReadonlyArray<[string, ReadonlyArray<string>, boolean, string]> = [
  ['Enter', [], true, 'MODIFY'],
  ['Escape', [], true, 'ABORT_CHOOSER'],
  ['Backspace', [], false, 'DELETE'],
  ['ArrowUp', ['Shift'], false, 'INSERT_BEFORE'],
  ['ArrowDown', ['Shift'], false, 'INSERT_AFTER'],
  ['Enter', ['Shift'], true, 'INFIX_EDIT'],
  ['Tab', [], true, 'EDIT_NEXT_UNDEFINED'],
  ['KeyZ', ['Meta'], false, 'UNDO'],
  ['KeyX', ['Meta'], false, 'CUT'],
  ['KeyV', ['Meta'], false, 'PASTE'],
  ['ArrowUp', [], false, 'MOVE_UP'],
  ['ArrowDown', [], false, 'MOVE_DOWN'],
  ['ArrowLeft', [], false, 'MOVE_LEFT'],
  ['ArrowRight', [], false, 'MOVE_RIGHT'],
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

function makeUniqueMap<K, V>(pairs: ReadonlyArray<[K, V]>) : Map<K, V> {
  const result: Map<K, V> = new Map();

  for (const [k, v] of pairs) {
    if (result.has(k)) {
      console.log('collision', k, result.get(k), v);
      throw new Error();
    }
    result.set(k, v);
  }

  return result;
}

function makeUniqueSet<T>(arr: ReadonlyArray<T>) : Set<T> {
  const result: Set<T> = new Set();

  for (const v of arr) {
    if (result.has(v)) {
      throw new Error();
    }
    result.add(v);
  }

  return result;
}

interface ChooserState {
  key: UID; // this lets us "reset" chooser if we jump directly to editing a different thing
  mode: 'before' | 'after' | 'new' | 'modify';
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

  const moveSelectionPerMap = (moveMap: Map<UID, UID>): void => {
    const curSelId = state.selectionId;
    const newSelId = moveMap.get(curSelId);
    if (newSelId) {
      setSelectionId(newSelId);
    }
  };

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
            moveSelectionPerMap(moveUp);
            break;

          case 'MOVE_DOWN':
            moveSelectionPerMap(moveDown);
            break;

          case 'MOVE_LEFT':
            moveSelectionPerMap(moveLeft);
            break;

          case 'MOVE_RIGHT':
            moveSelectionPerMap(moveRight);
            break;

          case 'DELETE':
            deleteSeletedNode();
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

      if ((state.choosing.mode === 'modify')) {
        // TODO: check if selectionId is for a "placeholder"
        const nodeToReplace = nodeIdToNode.get(state.selectionId);
        if (!nodeToReplace) {
          throw new Error();
        }

        const newRoot = replaceNode(root, nodeToReplace, node);

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
  const referentNameNode = undefined;

  // Move focus back to workspace after chooser has closed. This is hacky, but don't know better way to handle.
  const workspaceElem = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  const previouslyChoosing = useRef<boolean>(false);
  const focusWasOnTree: boolean = !!workspaceElem.current && workspaceElem.current.contains(document.activeElement);
  const focusWorkspaceNow: boolean = (autoFocus && firstRender.current) || (!state.choosing && (focusWasOnTree || previouslyChoosing.current));
  previouslyChoosing.current = !!state.choosing;
  firstRender.current = false;
  useLayoutEffect(() => {
    if (focusWorkspaceNow && workspaceElem.current) {
      workspaceElem.current.focus();
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

    // Draw node highlights (selection, etc)
    if (!selHighlightElem.current) {
      throw new Error();
    }
    const sheStyle = selHighlightElem.current.style;
    sheStyle.top = selectedElemRect.top + 'px';
    sheStyle.left = selectedElemRect.left + 'px';
    sheStyle.width = selectedElemRect.width + 'px';
    sheStyle.height = selectedElemRect.height + 'px';

    // Position the chooser
    const chooserKey = state.choosing ? state.choosing.key : undefined;

    if (positionedForChooserKey.current !== chooserKey) {
      // NOTE: Directly referring to these class names is hacky
      const cpElem = document.querySelector('.CodeView-chooser-positioner') as HTMLElement;
      if (cpElem) {
        // const cpRect = cpElem.getBoundingClientRect();
        cpElem.style.left = selectedElemRect.left + 'px';
        cpElem.style.top = (selectedElemRect.bottom + 2) + 'px';
      }

      positionedForChooserKey.current = chooserKey;
    }
  });

  const mainDefAnnoReactNode = annoSelectable(annoFunctionDefinitionView(root, treeViewCtx), root.nid, treeViewCtx);
  const moveUp = makeUniqueMap(mainDefAnnoReactNode.anno.moveUp);
  const moveDown = makeUniqueMap(mainDefAnnoReactNode.anno.moveDown);
  const moveLeft = makeUniqueMap(mainDefAnnoReactNode.anno.moveLeft);
  const moveRight = makeUniqueMap(mainDefAnnoReactNode.anno.moveRight);

  return (
    <div className="CodeView" onKeyDown={onKeyDown} ref={workspaceElem} tabIndex={0}>
      {mainDefAnnoReactNode.reactNode}
      {state.choosing && (() => {
        let context: 'tdef-body' | 'subexp' | 'text';

        // TODO: make this stuff correct
        const existingNode = nodeIdToNode.get(state.selectionId);
        if (!existingNode) {
          throw new Error();
        }
        if (existingNode.kind === NodeKind.Text) {
          context = 'text';
        } else {
          context = 'subexp';
        }

        const localEnv = staticEnvMap.get(existingNode);
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
