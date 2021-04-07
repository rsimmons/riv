import React, { useRef, useLayoutEffect, useCallback, useState } from 'react';
import { Action, initialState, reducer, getStaticEnvMap, getReferentNode, initStaticEnv } from '../codeview/EditReducer';
import { StoragePanel } from './StoragePanel';
import './Editor.css';
import { annoFunctionDefinitionView, annoSelectable, TreeViewContext } from '../codeview/TreeView';
import { Node, FunctionDefinitionNode } from '../compiler/Tree';
import { ProgramInfo, State } from '../codeview/State';
import Chooser from '../codeview/Chooser';

const keyActions: ReadonlyArray<[string, ReadonlyArray<string>, boolean, string]> = [
  ['Enter', [], true, 'TOGGLE_EDIT'],
  ['Escape', [], true, 'ABORT_EDIT'],
  ['Backspace', [], false, 'DELETE_SUBTREE'],
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

function useEditReducer(): [State, (action: Action) => void] {
  // The state is stored in useState, in order to trigger re-renders.
  // But the "authoritative" copy is stored with useRef, so that we don't
  // have any issues with see old versions from useState.
  const authoritativeState = useRef(initialState);
  const [copiedState, setCopiedState] = useState(initialState);

  // The dispatch method we return is memoized so that it's always the same function.
  const memoizedDispatch = useCallback((action) => {
    const newState = reducer(authoritativeState.current, action);
    authoritativeState.current = newState;
    setCopiedState(newState);
  }, []);

  return [copiedState, memoizedDispatch];
}

const Editor: React.FC<{autoFocus: boolean}> = ({ autoFocus }) => {
  // NOTE: We don't use useReducer here because it expects the reducer function
  // to be pure, and ours is not. So we have to do a workaround.
  const [state, dispatch] = useEditReducer();

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
        // hack: handle some actions here for now
        if (action === 'MOVE_UP') {
          const curSelId = displayedSelTree.selectedNode.nid;
          const newSelId = moveUp.get(curSelId);
          // TODO: move
          console.log(curSelId, newSelId);
        } else {
          dispatch({type: action});
        }
        e.preventDefault();
        return;
      }
    }

    if (!intoInput && printable && ((eventMods.size === 0) || setsEq(eventMods, new Set(['Shift']))) && !DONT_START_EDIT_CHARS.has(e.key)) {
      // Interestingly, the key here will still end up going into the input element, which is what we want.
      dispatch({type: 'BEGIN_EDIT'});
    }
  };

  const handleChangeProgramName = (newName: string) => {
    dispatch({type: 'SET_PROGRAM_NAME', newName});
  };

  const handleLoadProgram = (info: ProgramInfo, mainDef: FunctionDefinitionNode) => {
    dispatch({type: 'LOAD_PROGRAM', newProgram: {info: info, mainDef}});
  };

  const displayedSelTree = state.editing ? state.editing.initSelTree : state.stableSelTree;

  // this shouldn't be repeated every render
  const globalStaticEnv = initStaticEnv(state.globalFunctions);

  const displayedStaticEnvMap = getStaticEnvMap(displayedSelTree.mainDef, globalStaticEnv);
  const referentNameNode = getReferentNode(displayedSelTree.selectedNode, displayedStaticEnvMap);

  // Move focus back to workspace after chooser has closed. This is hacky, but don't know better way to handle.
  const workspaceElem = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  const previouslyEditing = useRef<boolean>(false);
  const focusWasOnTree: boolean = !!workspaceElem.current && workspaceElem.current.contains(document.activeElement);
  const focusWorkspaceNow: boolean = (autoFocus && firstRender.current) || (!state.editing && (focusWasOnTree || previouslyEditing.current));
  previouslyEditing.current = !!state.editing;
  firstRender.current = false;
  useLayoutEffect(() => {
    if (focusWorkspaceNow && workspaceElem.current) {
      workspaceElem.current.focus();
    }
  });

  const treeViewCtx: TreeViewContext = {
    markedNodes: {
      selected: displayedSelTree.selectedNode,
      referentName: referentNameNode,
    },
    // clipboardTopNode: (state.clipboardStack.length > 0) ? state.derivedLookups.streamIdToNode!.get(state.clipboardStack[state.clipboardStack.length-1].streamId) : null,
    // clipboardRestNodes: state.clipboardStack.slice(0, -1).map(frame => state.derivedLookups.streamIdToNode!.get(frame.streamId)),
    staticEnvMap: displayedStaticEnvMap,
    setSelectedNode: (node: Node) => {
      dispatch({
        type: 'SET_SELECTED_NODE',
        newNode: node,
      });
    },
    updateNode: (node: Node, newNode: Node) => {
      dispatch({
        type: 'UPDATE_NODE',
        node,
        newNode,
      });
    },
  };

  const positionedForEditSessionId: React.MutableRefObject<string | undefined> = useRef();

  // Position the chooser
  useLayoutEffect(() => {
    const editingSessionId = state.editing ? state.editing.sessionId : undefined;

    if (positionedForEditSessionId.current !== editingSessionId) {
      // NOTE: Directly referring to these class names is hacky
      const cpElem = document.querySelector('.Editor-chooser-positioner') as HTMLElement;
      const selElem = document.querySelector('.TreeView-selected');
      if (cpElem && selElem) {
        // const cpRect = cpElem.getBoundingClientRect();
        const selRect = selElem.getBoundingClientRect();
        cpElem.style.left = selRect.left + 'px';
        cpElem.style.top = (selRect.bottom + 2) + 'px';
      }

      positionedForEditSessionId.current = editingSessionId;
    }
  });

  console.log(displayedSelTree.mainDef);
  const mainDefAnnoReactNode = annoSelectable(annoFunctionDefinitionView(displayedSelTree.mainDef, treeViewCtx), displayedSelTree.mainDef, treeViewCtx);
  const moveUp = makeUniqueMap(mainDefAnnoReactNode.anno.moveUp);

  return (
    <div className="Editor">
      <div className="Editor-storage-panel-container Editor-panel">
        <StoragePanel programInfo={state.programInfo} mainDefinition={state.stableSelTree.mainDef} onChangeName={handleChangeProgramName} onLoadProgram={handleLoadProgram} />
      </div>
      <div className="Editor-workspace" onKeyDown={onKeyDown} ref={workspaceElem} tabIndex={0}>
        {mainDefAnnoReactNode.reactNode}
        {state.editing && (() => {
          const chooserTreeViewCtx: TreeViewContext = {
            ...treeViewCtx,
            setSelectedNode: () => {},
            staticEnvMap: getStaticEnvMap(state.editing.initSelTree.mainDef, globalStaticEnv),
          };

          return (
            <div className="Editor-chooser-positioner" style={{position: 'absolute'}}>
              <Chooser key={state.editing.sessionId} initSelTree={state.editing.initSelTree} dispatch={dispatch} compileError={state.editing.compileError} infixMode={state.editing.infixMode} treeViewCtx={chooserTreeViewCtx} />
            </div>
          );
        })()}
      </div>
    </div>
  );
}
export default Editor;
