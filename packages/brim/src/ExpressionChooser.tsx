import React, { useState, useEffect, useRef } from 'react';
import './ExpressionChooser.css';
import { Node, FunctionDefinitionNode, UserFunctionDefinitionNode, isStreamCreationNode, StreamCreationNode, isNamedNode, isStreamIndirectionNode } from './Tree';
import { fuzzy_match } from './vendor/fts_fuzzy_match';
import { environmentForSelectedNode } from './EditReducer';
import { generateStreamId, generateFunctionId } from './Identifier';
import { State } from './State';

interface UndefinedChoice {
  readonly type: 'undefined';
}

interface StreamRefChoice {
  readonly type: 'streamref';
  readonly node: StreamCreationNode;
}

interface StreamIndChoice {
  readonly type: 'streamind';
  readonly name: string;
}

interface NumberChoice {
  readonly type: 'number';
  readonly value: number;
}

interface FunctionChoice {
  readonly type: 'function';
  readonly node: FunctionDefinitionNode;
}

type Choice = UndefinedChoice | StreamRefChoice | StreamIndChoice | NumberChoice | FunctionChoice;

interface SearchResult<T> {
  score: number;
  formattedStr: string;
  name: string;
  data: T;
}
function fuzzySearch<T>(query: string, items: ReadonlyArray<[string, T]>): Array<SearchResult<T>> {
  const results: Array<SearchResult<T>> = [];

  for (const [name, data] of items) {
    const [hit, score, formattedStr] = fuzzy_match(query, name);
    if (typeof score !== 'number') {
      throw new Error();
    }
    if (typeof formattedStr !== 'string') {
      throw new Error();
    }
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

function generateChoices(text: string, mainState: State) {
  const choices: Array<Choice> = [];

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

  if (text.trim() !== '') {
    choices.push({
      type: 'streamind',
      name: text.trim(),
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

interface ChoiceProps {
  choice: Choice;
}
function Choice({ choice }: ChoiceProps) {
  switch (choice.type) {
    case 'undefined':
      return <em>undefined</em>

    case 'number':
      return <span>{choice.value}</span>

    case 'streamref':
      return <span><em>S</em> {isNamedNode(choice.node) ? choice.node.name : <em>unnamed</em>} <small>(id {choice.node.id})</small></span>

    case 'streamind':
      return <span><em>I</em> {choice.name}</span>

    case 'function':
      return <span><em>F</em> {choice.node.name}({choice.node.signature.parameters.map(param => (param.name.startsWith('_') ? '\u25A1' : param.name)).join(', ')})</span>

    default:
      throw new Error();
  }
}

interface DropdownState {
  choices: ReadonlyArray<Choice>;
  index: number;
}

const ExpressionChooser: React.FC<{mainState: State, dispatch: (action: any) => void}> = ({ mainState, dispatch }) => {
  const selectedListElem = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (selectedListElem.current) {
      selectedListElem.current.scrollIntoView({block: 'nearest', inline: 'nearest'});
    }
  });

  const [text, setText] = useState(() => {
    if (!mainState.editingSelected) {
      throw new Error();
    }
    const initFromNode = mainState.editingSelected.tentativeNode;

    if (mainState.editingSelected.overwrite) {
      return '';
    }

    // Initialize text based on node
    switch (initFromNode.type) {
      case 'UndefinedLiteral':
        return '';

      case 'NumberLiteral':
        return initFromNode.value.toString();

      case 'StreamReference':
      case 'Application':
        return ''; // Don't prefill with text, but in case we change our mind, old code is below

      case 'StreamIndirection':
        return initFromNode.name || '';
/*
      case 'StreamReference': {
        const targetExpressionNode = mainState.derivedLookups.streamIdToNode.get(initFromNode.targetStreamId);
        return targetExpressionNode.identifier ? targetExpressionNode.identifier.name : '';
      }

      case 'Application': {
        const functionNode = mainState.derivedLookups.functionIdToNode.get(initFromNode.functionId);
        return functionNode.identifier ? functionNode.identifier.name : '';
      }
*/

      default:
        throw new Error();
    }
  });

  // Update the expression node to reflect the current choice
  const realizeChoice = (state: DropdownState): void => {
    const choice = state.choices[state.index];

    if (!mainState.editingSelected) {
      throw new Error();
    }

    const originalNode = mainState.editingSelected.originalNode;
    if (!isStreamCreationNode(originalNode)) {
      throw new Error();
    }

    let newNode: Node;
    switch (choice.type) {
      case 'undefined':
        newNode = {
          type: 'UndefinedLiteral',
          id: originalNode.id,
          children: [],
        }
        break;

      case 'number':
        newNode = {
          type: 'NumberLiteral',
          id: originalNode.id,
          children: [],
          value: choice.value,
        };
        break;

      case 'streamref':
        newNode = {
          type: 'StreamReference',
          id: originalNode.id,
          children: [],
          targetStreamId: choice.node.id,
        };
        break;

      case 'streamind':
        newNode = {
          type: 'StreamIndirection',
          id: originalNode.id,
          children: (originalNode && isStreamIndirectionNode(originalNode)) ? originalNode.children : [
            {
              type: 'UndefinedLiteral',
              id: generateStreamId(),
              children: [],
            }
          ],
          name: choice.name,
        };
        break;

      case 'function':
        newNode = {
          type: 'Application',
          id: originalNode.id,
          functionId: choice.node.id,
          children: choice.node.signature.parameters.map(param => {
            if (param.type === 'stream') {
              return {
                type: 'UndefinedLiteral',
                id: generateStreamId(),
                children: [],
              };
            } else {
              const psig = param.type;
              const fdef: UserFunctionDefinitionNode = {
                type: 'UserFunctionDefinition',
                id: generateFunctionId(),
                name: null,
                signature: psig,
                children: [
                  {
                    type: 'UserFunctionDefinitionParameters',
                    children: psig.parameters.map(param => {
                      if (param.type === 'stream') {
                        return {
                          type: 'StreamParameter',
                          id: generateStreamId(),
                          name: param.name,
                          children: [],
                        };
                      } else {
                        throw new Error('unimplemented');
                      }
                    }),
                  },
                  {
                    type: 'UserFunctionDefinitionExpressions',
                    children: [
                      {
                        type: 'UndefinedLiteral',
                        id: generateStreamId(),
                        children: [],
                      },
                    ]
                  }
                ],
              };
              return fdef;
            }
          }),
        };
        break;

      default:
        throw new Error();
    }

    dispatch({type: 'UPDATE_EDITING_TENTATIVE_NODE', newNode});
  };

  const recomputeDropdownChoices = (text: string): DropdownState => {
    const newState: DropdownState = {
      choices: generateChoices(text, mainState),
      index: 0, // reset index to 0
    };
    realizeChoice(newState);
    return newState;
  };

  const adjustDropdownIndex = (amount: number): void => {
    setDropdownState(oldState => {
      const newState = {
        ...oldState,
        index: (oldState.index + amount + oldState.choices.length) % oldState.choices.length,
      };
      realizeChoice(newState);
      return newState;
    });
  };

  const [dropdownState, setDropdownState] = useState<DropdownState>(() => recomputeDropdownChoices(text));

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
export default ExpressionChooser;
