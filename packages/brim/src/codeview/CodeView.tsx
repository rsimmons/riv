import { layoutAnyNode, layoutFunctionDefinitionNode, TreeViewContext } from '../codeview/TreeView';
import { getStaticEnvMap, initStaticEnv, StaticEnvironment } from '../editor/EditorReducer';
import { TextChooser, MultiChooser, MultiChooserContext } from '../codeview/Chooser';
import { useLayoutEffect, useRef, useState } from 'react';
import { FunctionDefinitionNode, isTreeImplBodyNode, Node, NodeKind, UID } from '../compiler/Tree';
import globalNativeFunctions from '../builtin/globalNatives';
import { deleteNode, getNodeIdMap, getNodeParent, insertBeforeOrAfter, replaceNode } from '../compiler/TreeUtil';
import genuid from '../util/uid';
import { computeSeltreeLookups, findFirstUndef, findNodeById, isVirtualSelId, SeltreeNode, splitVirtualSelId } from './Seltree';
import { charIsPrintable } from '../util/misc';
import './CodeView.css';

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

function determineNodeChooserContext(node: Node, root: Node): MultiChooserContext {
  const parent = getNodeParent(node, root);
  if (parent) {
    if (parent.kind === NodeKind.TreeImpl) {
      return MultiChooserContext.ExprOrBind;
    } else if (parent.kind === NodeKind.Application) {
      return MultiChooserContext.Expr;
    } else {
      // TODO: this is not complete I think?
      return MultiChooserContext.Expr;
    }
  } else {
    // TODO: this is not complete
    return MultiChooserContext.Expr;
  }
}

function findFirstHoleSelId(under: Node, root: Node, globalStaticEnv: StaticEnvironment): string | undefined {
  const staticEnvMap = getStaticEnvMap(root, globalStaticEnv);
  const treeViewCtx: TreeViewContext = {
    staticEnvMap: staticEnvMap,
    onSelectNodeId: () => {},
  };
  const {seltree} = layoutAnyNode(root, treeViewCtx);
  const subtree = findNodeById(seltree, under.nid);
  if (!subtree) {
    throw new Error();
  }
  return subtree.flags.undef ? undefined : findFirstUndef(subtree); // doesn't count if the node itself is undef
}

enum ChooserMode {
  // Modify an existing node. Selected node is the one being modified, relSelId is null.
  Modify,

  // Insert after/before an existing node. relSelId is what is being inserted after/before,
  // which might not be the selected node.
  InsertAfter,
  InsertBefore,

  // Insert into an empty array via a "virtual" node, which is the selection id. relSelId is null.
  InsertEmpty,

  // Fill "holes" under a node. Selected node is the current one we are modifying, relSelId is the
  // node under which we are filling.
  Fill,

  // Like Fill, but after we are finished filling under relSelId, we insert after relSelId.
  FillInsertAfter,
}

interface ChooserState {
  key: UID; // this lets us "reset" chooser if we jump directly to editing a different thing
  mode: ChooserMode;
  relSelId: string | null; // node this is "related" to, which is generally not the selected node
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

  // this shouldn't be repeated every render
  const globalStaticEnv = initStaticEnv(globalNativeFunctions);

  const staticEnvMap = getStaticEnvMap(root, globalStaticEnv);
  // const referentNameNode = getReferentNode(displayedSelTree.selectedNode, displayedStaticEnvMap);

  const nodeIdToNode = getNodeIdMap(root);

  const treeViewCtx: TreeViewContext = {
    // clipboardTopNode: (state.clipboardStack.length > 0) ? state.derivedLookups.streamIdToNode!.get(state.clipboardStack[state.clipboardStack.length-1].streamId) : null,
    // clipboardRestNodes: state.clipboardStack.slice(0, -1).map(frame => state.derivedLookups.streamIdToNode!.get(frame.streamId)),
    staticEnvMap,
    onSelectNodeId: (nid: UID) => {
      setSelectionId(nid);
    },
  };

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
        mode: isVirtualSelId(state.selectionId) ? ChooserMode.InsertEmpty : ChooserMode.Modify,
        relSelId: null,
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

      const chooseInMode = (mode: ChooserMode, relSelId: string): CodeViewState => {
        console.log('chooseInMode', {mode, relSelId});
        return {
          ...s,
          choosing: {
            key: genuid(),
            mode,
            relSelId,
          },
        };
      }

      // This recurses to parents until we find a place we can insert
      const helper = (n: SeltreeNode): CodeViewState => {
        const pidx = rootSeltreeLookups.parentAndIdx.get(n);
        if (!pidx) {
          return s;
        }
        const [parent, ] = pidx;

        if (parent.flags.dynArrNonempty) {
          if (!n.selId) {
            throw new Error(); // I think this is right
          }
          if (parent.dir === 'block') {
            if (dir === 'up') {
              return chooseInMode(ChooserMode.InsertBefore, n.selId);
            } else if (dir === 'down') {
              if (n.flags.noInsertAfter) {
                return s;
              }
              return chooseInMode(ChooserMode.InsertAfter, n.selId);
            }
          } else {
            if (dir === 'back') {
              return chooseInMode(ChooserMode.InsertBefore, n.selId);
            } else if (dir === 'fwd') {
              if (n.flags.noInsertAfter) {
                return s;
              }
              return chooseInMode(ChooserMode.InsertAfter, n.selId);
            }
          }
        }

        return helper(parent);
      }

      return helper(seltreeNode);
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

    const printable = charIsPrintable(e.key);

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
      {state.choosing &&
        <div className="CodeView-chooser-positioner" style={{position: 'absolute'}}>
          {(() => {
            if (state.choosing.mode === ChooserMode.InsertEmpty) {
              if (!isVirtualSelId(state.selectionId)) {
                throw new Error();
              }

              const [parentSelId, ] = splitVirtualSelId(state.selectionId);
              const parentNode = nodeIdToNode.get(parentSelId);
              if (!parentNode) {
                throw new Error();
              }

              const localEnv = staticEnvMap.get(parentNode);
              if (!localEnv) {
                throw new Error();
              }

              const handleCommitChoice = (committedNode: Node): void => {
                let newRoot: Node;
                if (parentNode.kind === NodeKind.TreeImpl) {
                  if (!isTreeImplBodyNode(committedNode)) {
                    throw new Error();
                  }
                  if (parentNode.body.length > 0) {
                    throw new Error();
                  }

                  newRoot = replaceNode(root, parentNode, {
                    ...parentNode,
                    body: [committedNode],
                  });
                } else {
                  throw new Error();
                }

                const firstHoleSelId = findFirstHoleSelId(committedNode, newRoot, globalStaticEnv);

                onUpdateRoot(newRoot);

                setState(s => ({
                  ...s,
                  selectionId: firstHoleSelId || committedNode.nid,
                  choosing: firstHoleSelId ? {
                    key: genuid(),
                    mode: ChooserMode.Fill,
                    relSelId: committedNode.nid,
                  } : null,
                }));
              }

              return <MultiChooser key={state.choosing.key} context={/*TODO: fix*/MultiChooserContext.ExprOrBind} existingNode={null} localEnv={localEnv} onCommitChoice={handleCommitChoice} onAbort={abortChooser} />
            } else {
              if ([ChooserMode.Modify, ChooserMode.Fill, ChooserMode.FillInsertAfter].includes(state.choosing.mode)) {
                const selectedNode = nodeIdToNode.get(state.selectionId);
                if (!selectedNode) {
                  throw new Error();
                }

                if ((state.choosing.mode === ChooserMode.Modify) && (selectedNode.kind === NodeKind.Text)) {
                  const handleCommitChoice = (committedNode: Node): void => {
                    const newRoot = replaceNode(root, selectedNode, committedNode);
                    onUpdateRoot(newRoot);
                    setState(s => ({
                      ...s,
                      selectionId: committedNode.nid,
                      choosing: null,
                    }));
                  };

                  return <TextChooser key={state.choosing.key} existingNode={selectedNode} onCommitChoice={handleCommitChoice} />
                }

                const localEnv = staticEnvMap.get(selectedNode);
                if (!localEnv) {
                  throw new Error();
                }

                const chooserContext = determineNodeChooserContext(selectedNode, root);

                if (state.choosing.mode === ChooserMode.Modify) {
                  const handleCommitChoice = (committedNode: Node): void => {
                    const newRoot = replaceNode(root, selectedNode, committedNode);

                    const firstHoleSelId = findFirstHoleSelId(committedNode, newRoot, globalStaticEnv);

                    onUpdateRoot(newRoot);

                    setState(s => ({
                      ...s,
                      selectionId: firstHoleSelId || committedNode.nid,
                      choosing: firstHoleSelId ? {
                        key: genuid(),
                        mode: ChooserMode.Fill,
                        relSelId: committedNode.nid,
                      } : null,
                    }));
                  }

                  return <MultiChooser key={state.choosing.key} context={chooserContext} existingNode={selectedNode} localEnv={localEnv} onCommitChoice={handleCommitChoice} onAbort={abortChooser} />
                } else {
                  const state_choosing = state.choosing;

                  const handleCommitChoice = (committedNode: Node): void => {
                    const newRoot = replaceNode(root, selectedNode, committedNode);

                    if (!state_choosing.relSelId) {
                      throw new Error();
                    }
                    const state_choosing_relSelId = state_choosing.relSelId;
                    const newNodeIdToNode = getNodeIdMap(newRoot);
                    const relNode = newNodeIdToNode.get(state_choosing.relSelId);
                    if (!relNode) {
                      throw new Error();
                    }
                    const firstHoleSelId = findFirstHoleSelId(relNode, newRoot, globalStaticEnv);

                    onUpdateRoot(newRoot);

                    setState(s => ({
                      ...s,
                      selectionId: firstHoleSelId || state_choosing_relSelId,
                      choosing: firstHoleSelId ? {
                        key: genuid(),
                        mode: state_choosing.mode,
                        relSelId: state_choosing.relSelId,
                      } : ((state_choosing.mode === ChooserMode.FillInsertAfter) ? {
                        key: genuid(),
                        mode: ChooserMode.InsertAfter,
                        relSelId: state_choosing_relSelId,
                      }: null),
                    }));
                  }

                  return <MultiChooser key={state.choosing.key} context={chooserContext} existingNode={null} localEnv={localEnv} onCommitChoice={handleCommitChoice} onAbort={abortChooser} />
                }
              } else if ([ChooserMode.InsertBefore, ChooserMode.InsertAfter].includes(state.choosing.mode)) {
                if (state.choosing.relSelId === null) {
                  throw new Error();
                }
                const relNode = nodeIdToNode.get(state.choosing.relSelId);
                if (!relNode) {
                  throw new Error();
                }

                const localEnv = staticEnvMap.get(relNode);
                if (!localEnv) {
                  throw new Error();
                }

                const state_choosing = state.choosing;

                const handleCommitChoice = (committedNode: Node): void => {
                  const newRoot = insertBeforeOrAfter(root, relNode, committedNode, (state_choosing.mode === ChooserMode.InsertBefore));
                  const firstHoleSelId = findFirstHoleSelId(committedNode, newRoot, globalStaticEnv);
                  onUpdateRoot(newRoot);

                  if (state_choosing.mode === ChooserMode.InsertAfter) {
                    if (firstHoleSelId) {
                      setState(s => ({
                        ...s,
                        selectionId: firstHoleSelId,
                        choosing: {
                          key: genuid(),
                          mode: ChooserMode.FillInsertAfter,
                          relSelId: committedNode.nid,
                        },
                      }));
                    } else {
                      setState(s => ({
                        ...s,
                        selectionId: committedNode.nid,
                        choosing: {
                          key: genuid(),
                          mode: ChooserMode.InsertAfter,
                          relSelId: committedNode.nid,
                        },
                      }));
                    }
                  } else {
                    if (firstHoleSelId) {
                      setState(s => ({
                        ...s,
                        selectionId: firstHoleSelId,
                        choosing: {
                          key: genuid(),
                          mode: ChooserMode.Fill,
                          relSelId: committedNode.nid,
                        },
                      }));
                    } else {
                      setState(s => ({
                        ...s,
                        selectionId: committedNode.nid,
                        choosing: null,
                      }));
                    }
                  }
                };

                const chooserContext = determineNodeChooserContext(relNode, root);

                return <MultiChooser key={state.choosing.key} context={chooserContext} existingNode={null} localEnv={localEnv} onCommitChoice={handleCommitChoice} onAbort={abortChooser} />
              } else {
                throw new Error();
              }
            }
          })()}
        </div>
      }
      <div className="CodeView-selection" ref={selHighlightElem} />
    </div>
  );
}

export default CodeView;
