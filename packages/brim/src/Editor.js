import React, { createContext, useContext, useReducer, useRef, useEffect, useState } from 'react';
import { HotKeys, ObserveKeys } from "react-hotkeys";
import { initialState, reducer, addDerivedState, nodeFromPath } from './EditReducer';
import ExpressionChooser from './ExpressionChooser';
import './Editor.css';

const keyMap = {
  MOVE_UP: 'up',
  MOVE_DOWN: 'down',
  MOVE_LEFT: 'left',
  MOVE_RIGHT: 'right',

  ZOOM_IN: 'shift+right',
  ZOOM_OUT: 'shift+left',

  BEGIN_EDIT: 'enter',

  INSERT_AFTER: [';', ','],

  DELETE: 'backspace',
  NAME: '=',
};

// "Regular" (printable, basically) characters that are used as commands.
// We want to handle them as commands even if they happen in an input element,
// and we don't want them to trigger an edit to begin.
const COMMAND_CHARS = [
  '=',
  ';',
  ',',
];

const DispatchContext = createContext();

const SelectedNodeContext = createContext();
function useWithSelectedClass(obj, cns = '') {
  const selectedNode = useContext(SelectedNodeContext);
  return (obj === selectedNode) ? (cns + ' Editor-selected') : cns;
}

const FullStateContext = createContext();

function ProgramView({ program }) {
  return (
    <div className="Editor-program">
      {program.expressions.map((expression) => (
        <div className="Editor-program-expression" key={expression.streamId}>
          <ExpressionView expression={expression} />
        </div>
      ))}
    </div>
  );
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

  return <div><input className="Editor-text-edit-input" value={text} onChange={handleChange} onKeyDown={handleKeyDown} autoFocus /></div>
}

function NotEditingIdentifierView({ identifier }) {
  return identifier.name;
}

function ExpressionIdentifierView({ expression }) {
  const identifier = expression.identifier;
  const selected = (identifier === useContext(SelectedNodeContext));
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

  return (
    <div className={useWithSelectedClass(identifier)}>{(selected && editingSelected)
      ? <IdentifierChooser initialName={identifier.name} onUpdateName={handleUpdateName} onEndEdit={handleEndEdit} />
      : <NotEditingIdentifierView identifier={identifier} />
    }</div>
  );
}

function IntegerLiteralView({ integerLiteral }) {
  return <div>{integerLiteral.value}</div>;
}

function ArrayLiteralView({ arrayLiteral }) {
  return (
    <div>
      <div>[</div>
      <div className="Editor-array-items">
        {arrayLiteral.items.map(item => (
          <div className="Editor-array-item" key={item.streamId}><ExpressionView expression={item} /></div>
        ))}
      </div>
      <div>]</div>
    </div>
  );
}

function UndefinedExpressionView({ undefinedExpression }) {
  return <div className="Editor-undefined-expression">&nbsp;</div>;
}

function StreamReferenceView({ streamReference }) {
  const {streamIdToNode} = useContext(FullStateContext);
  const targetExpressionNode = streamIdToNode.get(streamReference.targetStreamId);
  if (!targetExpressionNode) {
    throw new Error();
  }
  return <div>{(targetExpressionNode.identifier && targetExpressionNode.identifier.name) ? targetExpressionNode.identifier.name : '<stream>'}</div>
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

    default:
      throw new Error();
  }
}

function ExpressionView({ expression }) {
  const selected = (expression === useContext(SelectedNodeContext));
  const mainState = useContext(FullStateContext);
  const dispatch = useContext(DispatchContext);

  return (
    <div className={useWithSelectedClass(expression, 'Editor-expression')}>
      <div className="Editor-expression-main">
        {(selected && mainState.editingSelected)
        ? <ExpressionChooser node={expression} mainState={mainState} dispatch={dispatch} />
        : <NotEditingExpressionView expression={expression} />
        }
      </div>
      {expression.identifier
        ? <div className="Editor-expression-identifier"><ExpressionIdentifierView expression={expression} /></div>
        : null
      }
    </div>
  );
}

export default function Editor({ autoFocus }) {
  const [plainState, dispatch] = useReducer(reducer, initialState);
  const state = addDerivedState(plainState);

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
    if ((e.target.tagName.toLowerCase() !== 'input') && ([...e.key].length === 1) && !e.altkey && !e.ctrlKey && !e.metaKey && !COMMAND_CHARS.includes(e.key)) {
      // Interestingly, the key here will still end up going into the input element, which is what we want.
      dispatch({type: 'BEGIN_EDIT_FRESH'});
    }
  };

  return (
    <HotKeys keyMap={keyMap} handlers={handlers}>
      <ObserveKeys only={COMMAND_CHARS}>
        <div className="Editor" onKeyDown={onKeyDown} tabIndex="0" ref={editorElem}>
          <DispatchContext.Provider value={dispatch}>
            <SelectedNodeContext.Provider value={nodeFromPath(state.root, state.selectionPath)}>
              <FullStateContext.Provider value={state}>
                <ProgramView program={state.root} />
              </FullStateContext.Provider>
            </SelectedNodeContext.Provider>
          </DispatchContext.Provider>
        </div>
      </ObserveKeys>
    </HotKeys>
  );
}
