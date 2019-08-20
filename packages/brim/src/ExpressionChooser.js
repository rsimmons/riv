import React, { useState, useEffect, useRef } from 'react';
import './ExpressionChooser.css';
import { fuzzy_match } from './vendor/fts_fuzzy_match';
import genuid from './uid';
import { environmentForSelectedNode } from './EditReducer';

function fuzzySearch(query, items) {
  const results = [];

  for (const [name, data] of items) {
    const [hit, score, formattedStr] = fuzzy_match(query, name);
    if (hit) {
      results.push({
        score,
        formattedStr,
        name,
        data,
      });
    }
  }
  if (query !== '') { // TODO: this is a hack, is query is empty, scoring is dumb
    results.sort((a, b) => (b.score - a.score));
  }
  return results;
}

const FLOAT_REGEX = /^[-+]?(?:\d*\.?\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?$/;

function generateChoices(text, mainState) {
  const choices = [];

  // If there is no text, put this first as a sort of default
  if (text === '') {
    choices.push({
      type: 'undefined',
    });
  }

  const { namedStreams, namedFunctions } = environmentForSelectedNode(mainState);

  const streamSearchResults = fuzzySearch(text, namedStreams);
  for (const result of streamSearchResults) {
    choices.push({
      type: 'streamref',
      node: result.data,
    });
  }

  const functionSearchResults = fuzzySearch(text, namedFunctions);
  for (const result of functionSearchResults) {
    choices.push({
      type: 'function',
      node: result.data,
    });
  }

  if (FLOAT_REGEX.test(text)) {
    choices.push({
      type: 'number',
      value: Number(text),
    });
  }

  if (choices.length === 0) {
    choices.push({
      type: 'undefined',
    });
  }

  return choices;
}

function Choice({ choice }) {
  switch (choice.type) {
    case 'undefined':
      return <em>undefined</em>

    case 'number':
      return <span>{choice.value}</span>

    case 'streamref':
      return <span><em>S</em> {choice.node.identifier.name} <small>(id {choice.node.streamId})</small></span>

    case 'function':
      return <span><em>F</em> {choice.node.identifier.name}({[].concat([
        choice.node.signature.parameters.map(n => (n.startsWith('_') ? '\u25A1' : n)), // parameters
        choice.node.signature.functionParameters.map(([n, ]) => 'F ' + ((n.startsWith('_') ? '\u25A1' : n))), // function parameters
      ]).join(', ')})</span>

    default:
      throw new Error();
  }
}

export default function ExpressionChooser({ node, mainState, dispatch }) {
  const selectedListElem = useRef();
  useEffect(() => {
    if (selectedListElem.current) {
      selectedListElem.current.scrollIntoView({block: 'nearest', inline: 'nearest'});
    }
  });

  const [text, setText] = useState(() => {
    // Initialize text based on existing node
    switch (node.type) {
      case 'UndefinedExpression':
        return '';

      case 'IntegerLiteral':
        return node.value.toString();

      case 'StreamReference': {
        const targetExpressionNode = mainState.derivedLookups.streamIdToNode.get(node.targetStreamId);
        return targetExpressionNode.identifier ? targetExpressionNode.identifier.name : '';
      }

      case 'Application': {
        const functionNode = mainState.derivedLookups.functionIdToNode.get(node.functionId);
        return functionNode.identifier ? functionNode.identifier.name : '';
      }

      default:
        throw new Error();
    }
  });

  // Update the expression node to reflect the current choice
  const realizeChoice = (state) => {
    const choice = state.choices[state.index];

    let newNode;
    switch (choice.type) {
      case 'undefined':
        newNode = {
          type: 'UndefinedExpression',
        }
        break;

      case 'number':
        newNode = {
          type: 'IntegerLiteral',
          value: choice.value,
        };
        break;

      case 'streamref':
        newNode = {
          type: 'StreamReference',
          targetStreamId: choice.node.streamId,
        };
        break;

      case 'function':
        newNode = {
          type: 'Application',
          functionId: choice.node.functionId,
          arguments: choice.node.signature.parameters.map(paramName => ({
            type: 'UndefinedExpression',
            streamId: genuid(),
            identifier: null,
          })),
          functionArguments: choice.node.signature.functionParameters.map(([, signature]) => ({
            type: 'UserFunction',
            functionId: genuid(),
            identifier: null,
            signature, // TODO: do we need to defensively copy this?
            parameters: signature.parameters.map(pn => ({
              type: 'Parameter',
              streamId: genuid(),
              identifier: {
                type: 'Identifier',
                name: pn,
              },
            })),
            functionParameterFunctionIds: signature.functionParameters.map(([pn, sig]) => genuid()),
            expressions: [
              {
                type: 'UndefinedExpression',
                streamId: genuid(),
                identifier: null,
              },
            ],
          })),
        };
        break;

      default:
        throw new Error();
    }

    newNode.streamId = node.streamId;
    newNode.identifier = node.identifier;

    dispatch({type: 'UPDATE_NODE', newNode});
  };

  const recomputeDropdownChoices = (text) => {
    const newState = {
      choices: generateChoices(text, mainState),
      index: 0, // reset index to 0
    };
    realizeChoice(newState);
    return newState;
  };

  const adjustDropdownIndex = (amount) => {
    setDropdownState(oldState => {
      const newState = {
        ...oldState,
        index: (oldState.index + amount + oldState.choices.length) % oldState.choices.length,
      };
      realizeChoice(newState);
      return newState;
    });
  };

  const [dropdownState, setDropdownState] = useState(() => recomputeDropdownChoices(text));

  const onChange = e => {
    const newText = e.target.value;

    if (newText === '[') {
      // This is a special case, we bypass the normal dropdown/choice stuff
      dispatch({type: 'END_EXPRESSION_EDIT'});
      dispatch({type: 'CREATE_ARRAY'});
    } else {
      setText(newText);
      setDropdownState(recomputeDropdownChoices(newText));
    }
  };

  const onKeyDown = e => {
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault(); // we don't want the default behavior of moving the cursor
        adjustDropdownIndex(-1);
        break;

      case 'ArrowDown':
        e.preventDefault(); // we don't want the default behavior of moving the cursor
        adjustDropdownIndex(1);
        break;

      default:
        // do nothing
        break;
    }
  };

  return (
    <div>
      <input className="Editor-text-edit-input" value={text} onChange={onChange} onKeyDown={onKeyDown} autoFocus />
      <ul className="ExpressionChooser-dropdown">
        {dropdownState.choices.map((choice, idx) =>
          <li key={idx} className={(idx === dropdownState.index) ? 'ExpressionChooser-dropdown-selected' : ''} ref={(idx === dropdownState.index) ? selectedListElem : undefined}><Choice choice={choice} /></li>
        )}
      </ul>
    </div>
  );
}
