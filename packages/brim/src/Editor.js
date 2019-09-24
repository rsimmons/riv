import React, { createContext, useContext, useReducer, useRef, useEffect, useState } from 'react';
import { HotKeys, ObserveKeys } from "react-hotkeys";
import { initialState, reducer, nodeFromPath } from './EditReducer';
import ExpressionChooser from './ExpressionChooser';
import StoragePanel from './StoragePanel';
import { INITIAL_THEME, ThemePicker } from './ThemePicker';
import './Editor.css';
import { isNamedNode } from './Tree';

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

const FullStateContext = createContext();

const DispatchContext = createContext();

const MarkedNodesContext = createContext();
function useMarks(obj) {
  const marks = [];
  const { selectedNode, clipboardTopNode, clipboardRestNodes } = useContext(MarkedNodesContext);
  if (obj === selectedNode) {
    marks.push('selected');
  }
  if (obj === clipboardTopNode) {
    marks.push('clipboard-top');
  }
  if (clipboardRestNodes.includes(obj)) {
    marks.push('clipboard-rest');
  }
  return marks;
}
function useHandleSelect(obj) {
  const dispatch = useContext(DispatchContext);
  const state = useContext(FullStateContext);

  return () => {
    const path = state.derivedLookups.nodeToPath.get(obj);
    if (path) {
      dispatch({
        type: 'SET_PATH',
        newPath: path,
      });
    }
  };
}
function useHandleEdit(obj) {
  const dispatch = useContext(DispatchContext);
  const state = useContext(FullStateContext);

  return () => {
    const path = state.derivedLookups.nodeToPath.get(obj);
    if (path) {
      dispatch({
        type: 'SET_PATH',
        newPath: path,
      });
      dispatch({
        type: 'TOGGLE_EDIT',
      });
    }
  };
}


const ThemeContext = createContext();

function DefinitionExpressionsView({ expressions }) {
  const { DefinitionExpression } = useContext(ThemeContext);

  return (
    <>
      {expressions.map((expression) => (
        <div key={expression.id}>
          <DefinitionExpression expression={<ExpressionView expression={expression} />} />
        </div>
      ))}
    </>
  )
}

function NumberLiteralView({ numberLiteral }) {
  return <div>{numberLiteral.value}</div>;
}

function ArrayLiteralView({ arrayLiteral }) {
  const { ArrayLiteral } = useContext(ThemeContext);

return <ArrayLiteral keyedItems={arrayLiteral.children.map(item => [item.id, <ExpressionView expression={item} />])} />
}

function UndefinedLiteralView({ undefinedLiteral }) {
  const { UndefinedExpression } = useContext(ThemeContext);
  return <UndefinedExpression />
}

function StreamReferenceView({ streamReference }) {
  const {streamIdToNode} = useContext(FullStateContext).derivedLookups;
  const targetExpressionNode = streamIdToNode.get(streamReference.targetStreamId);
  if (!targetExpressionNode) {
    throw new Error();
  }

  const { StreamReference } = useContext(ThemeContext);
  return <StreamReference name={isNamedNode(targetExpressionNode) ? targetExpressionNode.name : '<stream ' + streamReference.targetStreamId + '>'} />;
}

function StreamIndirectionView({ streamIndirection }) {
  const { StreamIndirection } = useContext(ThemeContext);
  return <StreamIndirection name={streamIndirection.name} child={<ExpressionView expression={streamIndirection.children[0]} />} />;
}

function UserFunctionView({ userFunction }) {
  const marks = useMarks(userFunction);
  const handleSelect = useHandleSelect(userFunction);
  const { UserFunction } = useContext(ThemeContext);

  return (
    <UserFunction parameterNames={userFunction.children[0].children.map(param => param.name)} expressions={<DefinitionExpressionsView expressions={userFunction.children[1].children} />} marks={marks} onSelect={handleSelect} />
  );
}

function ApplicationView({ application }) {
  const {functionIdToNode} = useContext(FullStateContext).derivedLookups;
  const functionNode = functionIdToNode.get(application.functionId);
  if (!functionNode) {
    throw new Error();
  }

  if (functionNode.signature.parameters.length !== application.children.length) {
    throw new Error('params and args length mismatch');
  }

  const functionName = functionNode.name ? functionNode.name : '<function ' + application.functionId + '>';
  const args = functionNode.signature.parameters.map((param, idx) => ({
    key: param.name,
    name: param.name.startsWith('_') ? undefined : param.name,
    expression: <ExpressionView expression={application.children[idx]} />
  }));

  const { Application } = useContext(ThemeContext);

  return <Application functionName={functionName} args={args} />;
}

function NotEditingExpressionView({ expression }) {
  switch (expression.type) {
    case 'NumberLiteral':
      return <NumberLiteralView numberLiteral={expression} />

    case 'ArrayLiteral':
      return <ArrayLiteralView arrayLiteral={expression} />

    case 'UndefinedLiteral':
      return <UndefinedLiteralView undefinedLiteral={expression} />

    case 'StreamReference':
      return <StreamReferenceView streamReference={expression} />

    case 'StreamIndirection':
      return <StreamIndirectionView streamIndirection={expression} />

    case 'Application':
      return <ApplicationView application={expression} />

    case 'UserFunctionDefinition':
      return <UserFunctionView userFunction={expression} />

    default:
      throw new Error();
  }
}

function ExpressionView({ expression }) {
  const marks = useMarks(expression);
  const handleSelect = useHandleSelect(expression);
  const handleEdit = useHandleEdit(expression);
  const mainState = useContext(FullStateContext);
  const editingSelected = mainState.editingSelected;
  const dispatch = useContext(DispatchContext);
  const { Expression } = useContext(ThemeContext);

  return <Expression marks={marks} onSelect={handleSelect} onEdit={handleEdit} inside={
    (marks.includes('selected') && editingSelected)
      ? <ExpressionChooser node={expression} mainState={mainState} dispatch={dispatch} />
      : <NotEditingExpressionView expression={expression} />
  } />;
}

export default function Editor({ autoFocus }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [theme, setTheme] = useState(INITIAL_THEME);

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

  const markedNodes = {
    selectedNode: nodeFromPath(state.program, state.selectionPath),
    clipboardTopNode: (state.clipboardStack.length > 0) ? state.derivedLookups.streamIdToNode.get(state.clipboardStack[state.clipboardStack.length-1].streamId) : null,
    clipboardRestNodes: state.clipboardStack.slice(0, -1).map(frame => state.derivedLookups.streamIdToNode.get(frame.streamId)),
  }

  const handleChangeProgramName = (newName) => {
    dispatch({type: 'SET_PROGRAM_NAME', newName});
  };

  const handleLoadProgram = (program) => {
    dispatch({type: 'LOAD_PROGRAM', program});
  };

  return (
    <div className="Editor">
      <HotKeys keyMap={keyMap} handlers={handlers}>
        <ObserveKeys only={CATCH_IN_INPUTS}>
          <div className="Editor-workspace" onKeyDown={onKeyDown} tabIndex="0" ref={editorElem}>
            <DispatchContext.Provider value={dispatch}>
              <MarkedNodesContext.Provider value={markedNodes}>
                <FullStateContext.Provider value={state}>
                  <ThemeContext.Provider value={theme}>
                    <UserFunctionView userFunction={state.program.children[0]} />
                  </ThemeContext.Provider>
                </FullStateContext.Provider>
              </MarkedNodesContext.Provider>
            </DispatchContext.Provider>
          </div>
        </ObserveKeys>
      </HotKeys>
      <div className="Editor-theme-controls Editor-panel"><ThemePicker onChange={newTheme => { setTheme(newTheme) }} /></div>
      <div className="Editor-storage-panel-container Editor-panel">
        <StoragePanel currentProgram={state.program} onChangeName={handleChangeProgramName} onLoadProgram={handleLoadProgram} />
      </div>
    </div>
  );
}
