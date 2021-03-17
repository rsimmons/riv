import React, { useReducer, useRef, useLayoutEffect } from 'react';
import { HotKeys, ObserveKeys } from "react-hotkeys";
import { initialState, reducer, getReferentNodeOfSelected, initStaticEnv, getStaticEnvForSelected } from '../codeview/EditReducer';
import { StoragePanel } from './StoragePanel';
import './Editor.css';
import { TreeFunctionDefinitionView, TreeViewContext } from '../codeview/TreeView';
import { Node, TreeFunctionDefinitionNode } from '../compiler/Tree';
import { ProgramInfo } from '../codeview/State';
import Chooser from '../codeview/Chooser';

const keyMap = {
  TOGGLE_EDIT: 'enter',
  ABORT_EDIT: 'escape',
  INFIX_EDIT: 'shift+enter',

  INSERT_BEFORE: 'shift+up',
  INSERT_AFTER: 'shift+down',

  DELETE_SUBTREE: 'backspace',

  EDIT_NEXT_UNDEFINED: 'tab',

  UNDO: 'command+z',

  CUT: 'command+x',
  PASTE: 'command+v',
};

// These are "normal" character keys that we use as commands. We identify them because we don't want
// them to begin a "overwrite edit".
const COMMAND_CHARS = new Set([
  '=',
  ',',
]);

// By default, if an input element is focused, keys will be ignored. But we want some
// of them to be processed even when an input is focused, and those ones are listed here.
// Note that react-hotkeys only lets us list the individual keys herfe not "combinations"
// as we would want.
const CATCH_IN_INPUTS = [
  'Enter',
  'Shift',
  'Escape',
  'Tab',
  '=',
  ',',
];

const Editor: React.FC<{autoFocus: boolean}> = ({ autoFocus }) => {
  const [state, dispatch] = useReducer(reducer, initialState);

  // TODO: memoize generation of this
  const handlers: {[key: string]: (keyEvent?: KeyboardEvent | undefined) => void} = {};
  for (const k of Object.keys(keyMap)) {
    handlers[k] = (() => (e: KeyboardEvent | undefined) => {
      if (e) {
        e.preventDefault(); // If we attempted to handle this, prevent default (scrolling window, entering character, etc.)
      }
      dispatch({type: k});
    })(); // IIFE to bind k
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // TODO: This is not a robust check, but the spec is complicated
    // (https://www.w3.org/TR/uievents-key/#keys-whitespace)
    if (((e.target as Element).tagName.toLowerCase() !== 'input') && ([...e.key].length === 1) && !e.altKey && !e.ctrlKey && !e.metaKey && !COMMAND_CHARS.has(e.key)) {
      // Interestingly, the key here will still end up going into the input element, which is what we want.
      dispatch({type: 'BEGIN_EDIT'});
    }
  };

  const handleChangeProgramName = (newName: string) => {
    dispatch({type: 'SET_PROGRAM_NAME', newName});
  };

  const handleLoadProgram = (info: ProgramInfo, mainDef: TreeFunctionDefinitionNode) => {
    dispatch({type: 'LOAD_PROGRAM', newProgram: {info: info, mainDef}});
  };

  const displayedSelTree = state.editing ? state.editing.initSelTree : state.stableSelTree;

  const referentNameNode = getReferentNodeOfSelected(displayedSelTree, state.globalFunctions);

  // Determine if we should focus the selected node. This is hacky, but don't know better way to handle.
  const editorElem = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  const previouslyEditing = useRef<boolean>(false);
  const focusWasUnderEditor: boolean = !!editorElem.current && editorElem.current.contains(document.activeElement);
  const focusSelected: boolean = (autoFocus && firstRender.current) || (!state.editing && (focusWasUnderEditor || previouslyEditing.current));
  previouslyEditing.current = !!state.editing;
  firstRender.current = false;

  const treeViewCtx: TreeViewContext = {
    markedNodes: {
      selected: displayedSelTree.selectedNode,
      referentName: referentNameNode,
    },
    // clipboardTopNode: (state.clipboardStack.length > 0) ? state.derivedLookups.streamIdToNode!.get(state.clipboardStack[state.clipboardStack.length-1].streamId) : null,
    // clipboardRestNodes: state.clipboardStack.slice(0, -1).map(frame => state.derivedLookups.streamIdToNode!.get(frame.streamId)),
    staticEnv: initStaticEnv(state.globalFunctions),
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
    focusSelected,
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

  return (
    <div className="Editor">
      <div className="Editor-storage-panel-container Editor-panel">
        <StoragePanel programInfo={state.programInfo} mainDefinition={state.stableSelTree.mainDef} onChangeName={handleChangeProgramName} onLoadProgram={handleLoadProgram} />
      </div>
      <HotKeys keyMap={keyMap} handlers={handlers}>
        <ObserveKeys only={CATCH_IN_INPUTS}>
          <div className="Editor-workspace" onKeyDown={onKeyDown} ref={editorElem}>
            <TreeFunctionDefinitionView node={displayedSelTree.mainDef} ctx={treeViewCtx} />
            {state.editing && (() => {
              const chooserTreeViewCtx: TreeViewContext = {
                ...treeViewCtx,
                setSelectedNode: () => {},
                staticEnv: getStaticEnvForSelected(state.editing.initSelTree, state.globalFunctions),
                focusSelected: false,
              };

              return (
                <div className="Editor-chooser-positioner" style={{position: 'absolute'}}>
                  <Chooser key={state.editing.sessionId} initSelTree={state.editing.initSelTree} dispatch={dispatch} compileError={state.editing.compileError} infixMode={state.editing.infixMode} treeViewCtx={chooserTreeViewCtx} />
                </div>
              );
            })()}
          </div>
        </ObserveKeys>
      </HotKeys>
    </div>
  );
}
export default Editor;
