import React, { useReducer, useRef, useEffect, useState } from 'react';
import { HotKeys, ObserveKeys } from "react-hotkeys";
import { initialState, reducer, nodeFromPath } from './EditReducer';
import StoragePanel from './StoragePanel';
import './Editor.css';
import { NodeView, TreeViewContextProvider } from './TreeView';

const keyMap = {
  MOVE_UP: 'up',
  MOVE_DOWN: 'down',
  MOVE_LEFT: 'left',
  MOVE_RIGHT: 'right',

  TOGGLE_EDIT: 'enter',
  ABORT_EDIT: 'escape',

  EDIT_AFTER: ['shift+enter', ','],

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
// Note that react-hotkeys only lets us list the individual keys here not "combinations"
// as we would want.
const CATCH_IN_INPUTS = [
  'Enter',
  'Shift',
  'Escape',
  'Tab',
  '=',
  ',',
];

export default function Editor({ autoFocus }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const editorElem = useRef();

  // Do auto-focus if prop is set
  const [constAutoFocus] = useState(autoFocus);
  useEffect(() => {
    if (constAutoFocus) {
      // Focus editor after initial render
      editorElem.current.focus();
    }
  }, [constAutoFocus]);

  // Restore focus to editor elem if input box just went away.
  // NOTE: This is hacky, but don't know better way to handle.
  const previouslyEditingSelected = useRef(false);
  useEffect(() => {
    if (previouslyEditingSelected.current && !state.editingSelected) {
      editorElem.current.focus();
    }
    previouslyEditingSelected.current = state.editingSelected;
  });

  // TODO: memoize generation of this
  const handlers = {};
  for (const k of Object.keys(keyMap)) {
    handlers[k] = (() => (e) => {
      e.preventDefault(); // If we attempted to handle this, prevent default (scrolling window, entering character, etc.)
      dispatch({type: k});
    })(); // IIFE to bind k
  }

  const onKeyDown = e => {
    // TODO: This is not a robust check, but the spec is complicated
    // (https://www.w3.org/TR/uievents-key/#keys-whitespace)
    if ((e.target.tagName.toLowerCase() !== 'input') && ([...e.key].length === 1) && !e.altkey && !e.ctrlKey && !e.metaKey && !COMMAND_CHARS.has(e.key)) {
      // Interestingly, the key here will still end up going into the input element, which is what we want.
      dispatch({type: 'BEGIN_OVERWRITE_EDIT'});
    }
  };

  const handleChangeProgramName = (newName) => {
    dispatch({type: 'SET_PROGRAM_NAME', newName});
  };

  const handleLoadProgram = (program) => {
    dispatch({type: 'LOAD_PROGRAM', program});
  };

  const treeViewCtxData = {
    selectedNode: nodeFromPath(state.program, state.selectionPath),
    clipboardTopNode: (state.clipboardStack.length > 0) ? state.derivedLookups.streamIdToNode.get(state.clipboardStack[state.clipboardStack.length-1].streamId) : null,
    clipboardRestNodes: state.clipboardStack.slice(0, -1).map(frame => state.derivedLookups.streamIdToNode.get(frame.streamId)),
    streamIdToNode: state.derivedLookups.streamIdToNode,
    functionIdToNode: state.derivedLookups.functionIdToNode,
    mainState: state,
    dispatch,
    onSelectNode: (node) => {
      const path = state.derivedLookups.nodeToPath.get(node);
      if (path) {
        dispatch({
          type: 'SET_PATH',
          newPath: path,
        });
      }
    },
  };

  return (
    <div className="Editor">
      <HotKeys keyMap={keyMap} handlers={handlers}>
        <ObserveKeys only={CATCH_IN_INPUTS}>
          <div className="Editor-workspace" onKeyDown={onKeyDown} tabIndex="0" ref={editorElem}>
            <TreeViewContextProvider value={treeViewCtxData}>
              <NodeView node={state.program.children[0]} />
            </TreeViewContextProvider>
          </div>
        </ObserveKeys>
      </HotKeys>
      <div className="Editor-storage-panel-container Editor-panel">
        <StoragePanel currentProgram={state.program} onChangeName={handleChangeProgramName} onLoadProgram={handleLoadProgram} />
      </div>
    </div>
  );
}
