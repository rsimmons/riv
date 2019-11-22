import React, { useState, useEffect, useRef } from 'react';
import './ExpressionChooser.css';
import { generateStreamId, generateFunctionId, Node, FunctionDefinitionNode, TreeFunctionDefinitionNode, NodeKind, isStreamExpressionNode } from './Tree';
import { fuzzy_match } from './vendor/fts_fuzzy_match';
// import { environmentForSelectedNode } from './EditReducer';
import { State } from './State';

interface UndefinedChoice {
  readonly type: 'undefined';
}

interface NumberChoice {
  readonly type: 'number';
  readonly value: number;
}

/*
interface StreamRefChoice {
  readonly type: 'streamref';
  readonly node: StreamDefinition;
}

interface FunctionChoice {
  readonly type: 'function';
  readonly node: FunctionDefinitionNode;
}

type Choice = UndefinedChoice | StreamRefChoice | StreamIndChoice | NumberChoice | FunctionChoice;
*/
type Choice = UndefinedChoice | NumberChoice;

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
  if (query !== '') { // TODO: this is a hack, if query is empty, scoring is dumb
    results.sort((a, b) => (b.score - a.score));
  }
  return results;
}

const FLOAT_REGEX = /^[-+]?(?:\d*\.?\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?$/;

function generateChoices(text: string) {
  const choices: Array<Choice> = [];

  // If there is no text, put this first as a sort of default
  if (text === '') {
    choices.push({
      type: 'undefined',
    });
  }

  if (FLOAT_REGEX.test(text)) {
    choices.push({
      type: 'number',
      value: Number(text),
    });
  }

  /*
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
  */

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

    /*
    case 'streamref':
      return <span><em>S</em> {isNamedNode(choice.node) ? choice.node.name : <em>unnamed</em>} <small>(id {choice.node.id})</small></span>

    case 'function':
      return <span><em>F</em> {choice.node.name}({choice.node.signature.parameters.map(param => (param.name.startsWith('_') ? '\u25A1' : param.name)).join(', ')})</span>
    */

    default:
      throw new Error();
  }
}

interface DropdownState {
  choices: ReadonlyArray<Choice>;
  index: number;
}

const ExpressionChooser: React.FC<{initNode: Node, dispatch: (action: any) => void}> = ({ initNode, dispatch }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current && inputRef.current.select();
  }, []);

  const selectedListElem = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (selectedListElem.current) {
      selectedListElem.current.scrollIntoView({block: 'nearest', inline: 'nearest'});
    }
  });

  const [text, setText] = useState(() => {
    // Initialize text based on node
    switch (initNode.kind) {
      case NodeKind.UndefinedLiteral:
        return '';

      case NodeKind.NumberLiteral:
        return initNode.val.toString();

      case NodeKind.StreamReference:
      case NodeKind.RefApplication:
        return ''; // Don't prefill with text

      default:
        throw new Error();
    }
  });

  // Update the expression node to reflect the current choice
  const realizeChoice = (state: DropdownState): void => {
    const choice = state.choices[state.index];

    if (isStreamExpressionNode(initNode)) {
      const newSid = ('sid' in initNode) ? initNode.sid : initNode.sids[0];

      let newNode: Node;
      switch (choice.type) {
        case 'undefined':
          newNode = {
            kind: NodeKind.UndefinedLiteral,
            sid: newSid,
            desc: initNode.desc,
          }
          break;

        case 'number':
          newNode = {
            kind: NodeKind.NumberLiteral,
            sid: newSid,
            desc: initNode.desc,
            val: choice.value,
          }
          break;

        /*
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
                const fdef: TreeFunctionDefinitionNode = {
                  type: 'TreeFunctionDefinition',
                  id: generateFunctionId(),
                  name: null,
                  signature: psig,
                  children: [
                    {
                      type: 'TreeFunctionDefinitionParameters',
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
                      type: 'TreeFunctionDefinitionExpressions',
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
        */

        default:
          throw new Error();
      }

      dispatch({type: 'UPDATE_EDITING_NODE', newNode});
    }
  };

  const recomputeDropdownChoices = (text: string): DropdownState => {
    const newState: DropdownState = {
      choices: generateChoices(text),
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
      // dispatch({type: 'END_EXPRESSION_EDIT'});
      // dispatch({type: 'CREATE_ARRAY'});
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
      <input className="ExpressionChooser-input" value={text} onChange={onChange} onKeyDown={onKeyDown} ref={inputRef} autoFocus />
      <ul className="ExpressionChooser-dropdown">
        {dropdownState.choices.map((choice, idx) =>
          <li key={idx} className={(idx === dropdownState.index) ? 'ExpressionChooser-dropdown-selected' : ''} ref={(idx === dropdownState.index) ? selectedListElem : undefined}><Choice choice={choice} /></li>
        )}
      </ul>
    </div>
  );
}
export default ExpressionChooser;
