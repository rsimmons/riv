import React, { createContext, useContext, useReducer, useRef, useEffect, useState } from 'react';
import { HotKeys, ObserveKeys } from "react-hotkeys";
import { initialState, reducer, nodeFromPath } from './EditReducer';
import ExpressionChooser from './ExpressionChooser';
import { INITIAL_THEME, ThemePicker } from './ThemePicker';
import './Editor.css';

const keyMap = {
  MOVE_UP: 'up',
  MOVE_DOWN: 'down',
  MOVE_LEFT: 'left',
  MOVE_RIGHT: 'right',

  ZOOM_IN: 'shift+right',
  ZOOM_OUT: 'shift+left',

  TOGGLE_EDIT: 'enter',

  EDIT_AFTER: ['shift+enter', ','],

  DELETE: 'backspace',

  BEGIN_EXPRESSION_IDENTIFIER_EDIT: '=',
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
  '=',
  ',',
];

const DispatchContext = createContext();

const SelectedNodeContext = createContext();
function useIsSelected(obj) {
  const selectedNode = useContext(SelectedNodeContext);
  return obj === selectedNode;
}

const FullStateContext = createContext();

const ThemeContext = createContext();

function ProgramView({ program }) {
  const { Program } = useContext(ThemeContext);

  return <Program expressions={<DefinitionExpressionsView expressions={program.mainDefinition.expressions} />} />;
}

function DefinitionExpressionsView({ expressions }) {
  const { DefinitionExpression } = useContext(ThemeContext);

  return (
    <>
      {expressions.map((expression) => (
        <div key={expression.streamId}>
          <DefinitionExpression expression={<ExpressionView expression={expression} />} />
        </div>
      ))}
    </>
  )
}

function IdentifierChooser({ initialName, onUpdateName, onEndEdit }) {
  const [text, setText] = useState(initialName || '');

  const handleChange = e => {
    const newText = e.target.value;
    setText(newText);
    if (onUpdateName) {
      onUpdateName(newText);
    }
  };

  const handleKeyDown = e => {
    switch (e.key) {
      case 'Enter':
        e.stopPropagation();
        if (onEndEdit) {
          onEndEdit();
        }
        break;

      default:
        // do nothing
        break;
    }
  };

  return <input className="Editor-text-edit-input" value={text} onChange={handleChange} onKeyDown={handleKeyDown} autoFocus />;
}

function ExpressionIdentifierView({ expression }) {
  const identifier = expression.identifier;
  const selected = useIsSelected(identifier);
  const {editingSelected} = useContext(FullStateContext);
  const dispatch = useContext(DispatchContext);

  const handleUpdateName = (name) => {
    dispatch({
      type: 'UPDATE_NODE',
      newNode: {
        type: 'Identifier',
        name,
      },
    });
  };

  const handleEndEdit = () => {
    dispatch({type: 'END_EXPRESSION_IDENTIFIER_EDIT'});
  };

  const { Identifier } = useContext(ThemeContext);

  return <Identifier selected={selected} inside={(selected && editingSelected)
    ? <IdentifierChooser initialName={identifier.name} onUpdateName={handleUpdateName} onEndEdit={handleEndEdit} />
    : identifier.name
  } />;
}

function IntegerLiteralView({ integerLiteral }) {
  return <div>{integerLiteral.value}</div>;
}

function ArrayLiteralView({ arrayLiteral }) {
  const { ArrayLiteral } = useContext(ThemeContext);

return <ArrayLiteral keyedItems={arrayLiteral.items.map(item => [item.streamId, <ExpressionView expression={item} />])} />
}

function UndefinedExpressionView({ undefinedExpression }) {
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
  return <StreamReference name={(targetExpressionNode.identifier && targetExpressionNode.identifier.name) ? targetExpressionNode.identifier.name : '<stream ' + streamReference.targetStreamId + '>'} />;
}

function UserFunctionView({ userFunction }) {
  const selected = useIsSelected(userFunction);
  const { UserFunction } = useContext(ThemeContext);

  return (
    <UserFunction parameterNames={userFunction.parameters.map(param => param.identifier.name)} expressions={<DefinitionExpressionsView expressions={userFunction.expressions} />} selected={selected} />
  );
}

function ApplicationView({ application }) {
  const {functionIdToNode} = useContext(FullStateContext).derivedLookups;
  const functionNode = functionIdToNode.get(application.functionId);
  if (!functionNode) {
    throw new Error();
  }

  if (functionNode.signature.parameters.length !== application.arguments.length) {
    throw new Error('params and args length mismatch');
  }

  if (functionNode.signature.functionParameters.length !== application.functionArguments.length) {
    throw new Error('function params and args length mismatch');
  }

  const functionName = (functionNode.identifier && functionNode.identifier.name) ? functionNode.identifier.name : '<function ' + application.functionId + '>';
  const streamArgs = functionNode.signature.parameters.map((paramName, idx) => ({
    key: paramName,
    name: paramName.startsWith('_') ? undefined : paramName,
    expression: <ExpressionView expression={application.arguments[idx]} />
  }));
  const functionArgs = functionNode.signature.functionParameters.map(([paramName, signature], idx) => ({
    key: paramName,
    name: 'dunno',
    functionExpression: <UserFunctionView userFunction={application.functionArguments[idx]} />
  }));

  const { Application } = useContext(ThemeContext);

  return <Application functionName={functionName} streamArgs={streamArgs} functionArgs={functionArgs} />;
}

function NotEditingExpressionView({ expression }) {
  switch (expression.type) {
    case 'IntegerLiteral':
      return <IntegerLiteralView integerLiteral={expression} />

    case 'ArrayLiteral':
      return <ArrayLiteralView arrayLiteral={expression} />

    case 'UndefinedExpression':
      return <UndefinedExpressionView undefinedExpression={expression} />

    case 'StreamReference':
      return <StreamReferenceView streamReference={expression} />

    case 'Application':
      return <ApplicationView application={expression} />

    default:
      throw new Error();
  }
}

function ExpressionView({ expression }) {
  const selected = useIsSelected(expression);
  const mainState = useContext(FullStateContext);
  const editingSelected = mainState.editingSelected;
  const dispatch = useContext(DispatchContext);
  const { Expression } = useContext(ThemeContext);

  return <Expression identifier={expression.identifier ? <ExpressionIdentifierView expression={expression} /> : null} selected={selected} inside={
    (selected && editingSelected)
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

  return (
    <HotKeys keyMap={keyMap} handlers={handlers}>
      <ObserveKeys only={CATCH_IN_INPUTS}>
        <div className="Editor" onKeyDown={onKeyDown} tabIndex="0" ref={editorElem}>
          <div className="Editor-theme-controls"><ThemePicker onChange={newTheme => { setTheme(newTheme) }} /></div>
          <DispatchContext.Provider value={dispatch}>
            <SelectedNodeContext.Provider value={nodeFromPath(state.program, state.selectionPath)}>
              <FullStateContext.Provider value={state}>
                <ThemeContext.Provider value={theme}>
                  <ProgramView program={state.program} />
                </ThemeContext.Provider>
              </FullStateContext.Provider>
            </SelectedNodeContext.Provider>
          </DispatchContext.Provider>
        </div>
      </ObserveKeys>
    </HotKeys>
  );
}
