import React, { useState } from 'react';
import './ExpressionChooser.css';
import { fuzzy_match } from './vendor/fts_fuzzy_match';

/*
export default class NodePool {
  constructor() {
    // Build pool
    this.pool = [];
    for (const k in nodeDefs) {
      this.pool.push({
        id: k,
        def: nodeDefs[k],
      });
    }

    // Sort alphabetically for now since we have no other relevance signals
    this.pool.sort((a, b) => {
      const sa = a.id.toUpperCase();
      const sb = b.id.toUpperCase();
      if (sa < sb) {
        return -1;
      }
      if (sa > sb) {
        return 1;
      }
      return 0;
    });
  }

  lookup(id) {
    return nodeDefs[id];
  }

  search(query) {
    const results = [];
    for (const node of this.pool) {
      const [hit, score, formattedStr] = fuzzy_match(query, node.id);
      if (hit) {
        results.push({
          score,
          formattedStr,
          node,
        });
      }
    }
    if (query !== '') { // TOOD: this is a hack, is query is empty, scoring is dumb
      results.sort((a, b) => (b.score - a.score));
    }
    return results;
  }
}
*/

function fuzzySearchNames(query, names) {
  const results = [];

  for (const name of names) {
    const [hit, score, formattedStr] = fuzzy_match(query, name);
    if (hit) {
      results.push({
        score,
        formattedStr,
        name,
      });
    }
  }
  if (query !== '') { // TOOD: this is a hack, is query is empty, scoring is dumb
    results.sort((a, b) => (b.score - a.score));
  }
  return results;
}

const FLOAT_REGEX = /^[-+]?(?:\d*\.?\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?$/;

function generateChoices(text, mainState) {
  const choices = [];

  const envNames = mainState.nameToNodes.keys();
  const envSearchResults = fuzzySearchNames(text, envNames);
  for (const result of envSearchResults) {
    const nodes = mainState.nameToNodes.get(result.name);
    for (const node of nodes) {
      choices.push({
        type: 'streamref',
        node,
      })
    }
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
      return <span>{choice.node.identifier.name} ({choice.node.streamId})</span>

    default:
      throw new Error();
  }
}

export default function ExpressionChooser({ node, mainState, dispatch }) {
  const [text, setText] = useState(() => {
    // Initialize text based on existing node
    switch (node.type) {
      case 'UndefinedExpression':
        return '';

      case 'IntegerLiteral':
        return node.value.toString();

      case 'StreamReference': {
        const targetExpressionNode = mainState.streamIdToNode.get(node.targetStreamId);
        return targetExpressionNode.identifier ? targetExpressionNode.identifier.name : '';
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
      case 'Enter':
        e.stopPropagation();
        dispatch({type: 'END_EXPRESSION_EDIT'});
        break;

      case 'Backspace':
        if (!e.target.value) {
          dispatch({type: 'END_EXPRESSION_EDIT'});
          dispatch({type: 'DELETE'});
        }
        break;

      case 'ArrowUp':
        e.stopPropagation();
        e.preventDefault();
        adjustDropdownIndex(-1);
        break;

      case 'ArrowDown':
        e.stopPropagation();
        e.preventDefault();
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
          <li key={idx} className={(idx === dropdownState.index) ? 'ExpressionChooser-dropdown-selected' : ''}><Choice choice={choice} /></li>
        )}
      </ul>
    </div>
  );
}
