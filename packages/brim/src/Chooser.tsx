import React, { useState, useEffect, useRef, useMemo } from 'react';
import './Chooser.css';
import { generateStreamId, Node, FunctionDefinitionNode, NodeKind, isStreamExpressionNode, ApplicationNode, SignatureFunctionParameterNode, generateFunctionId, StreamID, StreamExpressionNode, generateApplicationId, ApplicationOut, FunctionExpressionNode, NativeFunctionDefinitionNode, UndefinedLiteralNode, ArrayLiteralNode, NameNode } from './Tree';
import { streamExprReturnedId, functionReturnedIndex } from './TreeUtil';
import { fuzzy_match } from './vendor/fts_fuzzy_match';
import { StreamDefinition, computeParentLookup, computeEnvironmentLookups } from './EditReducer';
import { SelTree } from './State';

interface UndefinedChoice {
  readonly type: 'undefined';
}

interface NumberChoice {
  readonly type: 'number';
  readonly value: number;
}

interface TextChoice {
  readonly type: 'text';
  readonly value: string;
}

interface BooleanChoice {
  readonly type: 'boolean';
  readonly value: boolean;
}

interface BindChoice {
  readonly type: 'bind';
  readonly name: string;
}

interface StreamRefChoice {
  readonly type: 'streamref';
  readonly sid: StreamID;
  readonly name: string;
}

interface AppChoice {
  readonly type: 'app';
  readonly text: string;
  readonly funcDefNode: FunctionDefinitionNode;
}

type Choice = UndefinedChoice | NumberChoice | TextChoice | BooleanChoice | BindChoice | StreamRefChoice | AppChoice;

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

interface ChoiceProps {
  choice: Choice;
}
function Choice({ choice }: ChoiceProps) {
  switch (choice.type) {
    case 'undefined':
      return <em>undefined</em>

    case 'number':
      return <span>{choice.value.toString()}</span>

    case 'text':
      return <span><em>T</em> {choice.value}</span>

    case 'boolean':
      return <span><em>B</em> {choice.value.toString()}</span>

    case 'bind':
      return <span><em>I</em> {choice.name}</span>

    case 'streamref':
      return <span><em>S</em> {choice.name}</span>

    case 'app':
      return <span><em>F</em> {choice.text}</span>

    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exhaustive: never = choice; // this will cause a type error if we haven't handled all cases
      throw new Error();
    }
  }
}

interface DropdownState {
  choices: ReadonlyArray<Choice>;
  index: number;
}

const ExpressionChooser: React.FC<{initSelTree: SelTree, nativeFunctions: ReadonlyArray<NativeFunctionDefinitionNode>, dispatch: (action: any) => void, compileError: string | undefined}> = ({ initSelTree, nativeFunctions, dispatch, compileError }) => {
  const parentLookup = useMemo(() => computeParentLookup(initSelTree.mainDefinition), [initSelTree.mainDefinition]);
  const parent = parentLookup.get(initSelTree.selectedNode);
  if (!parent) {
    throw new Error();
  }
  const atRoot = parent.kind === NodeKind.TreeFunctionBody;
  const envLookups = useMemo(() => computeEnvironmentLookups(initSelTree.mainDefinition, nativeFunctions), [initSelTree.mainDefinition, nativeFunctions]);

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

  if (!isStreamExpressionNode(initSelTree.selectedNode)) {
    throw new Error();
  }

  const initNode = initSelTree.selectedNode;

  const [text, setText] = useState(() => {
    // Initialize text based on node
    switch (initNode.kind) {
      case NodeKind.UndefinedLiteral:
        return '';

      case NodeKind.NumberLiteral:
        return initNode.val.toString();

      case NodeKind.TextLiteral:
        return initNode.val;

      case NodeKind.BooleanLiteral:
        return initNode.val.toString();

      case NodeKind.ArrayLiteral:
      case NodeKind.StreamReference:
      case NodeKind.Application:
        return ''; // Don't prefill with text

      default: {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const exhaustive: never = initNode; // this will cause a type error if we haven't handled all cases
        throw new Error();
      }
    }
  });

  const generateChoices = (text: string): ReadonlyArray<Choice> => {
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

    const nearestDef = envLookups.nodeToNearestTreeDef.get(initNode);
    if (!nearestDef) {
      throw new Error();
    }
    const streamEnv = envLookups.treeDefToStreamEnv.get(nearestDef);
    if (!streamEnv) {
      throw new Error();
    }
    const functionEnv = envLookups.treeDefToFunctionEnv.get(nearestDef);
    if (!functionEnv) {
      throw new Error();
    }

    const envStreams: Array<[string, StreamDefinition]> = [];
    streamEnv.forEach((sdef, ) => {
      const selfRef = (sdef.kind === 'expr') && (sdef.expr === initNode);
      if (!selfRef) {
        envStreams.push([sdef.name.text || '<unnamed>', sdef]);
      }
    });

    const streamSearchResults = fuzzySearch(text, envStreams);
    for (const result of streamSearchResults) {
      choices.push({
        type: 'streamref',
        sid: result.data.sid,
        name: result.name,
      });
    }

    const namedFunctions: Array<[string, FunctionDefinitionNode]> = [];
    functionEnv.forEach((defNode, ) => {
      if (defNode.format) {
        const defName = defNode.format;
        if (atRoot) {
          namedFunctions.push([defName, defNode]);
        } else {
          const retIdx = functionReturnedIndex(defNode);
          if (retIdx !== undefined) {
            namedFunctions.push([defName, defNode]);
          }
        }
      }
    });
    const functionSearchResults = fuzzySearch(text, namedFunctions);
    for (const result of functionSearchResults) {
      const funcDefNode = result.data;
      choices.push({
        type: 'app',
        text: result.name,
        funcDefNode,
      });
    }

    for (const bv of [true, false]) {
      if (bv.toString().startsWith(text)) {
        choices.push({
          type: 'boolean',
          value: bv,
        });
      }
    }

    choices.push({
      type: 'text',
      value: text,
    });

    if (atRoot && text.trim() !== '') {
      choices.push({
        type: 'bind',
        name: text.trim(),
      });
    }

    if (choices.length === 0) {
      choices.push({
        type: 'undefined',
      });
    }

    return choices;
  }

  // Update the expression node to reflect the current choice
  const realizeChoice = (state: DropdownState): void => {
    const choice = state.choices[state.index];

    if (isStreamExpressionNode(initNode)) {
      let newNode: Node;
      const newSid: StreamID = (initNode.kind === NodeKind.StreamReference) ? generateStreamId() : (streamExprReturnedId(initNode) || generateStreamId());

      let origStreamChildren: ReadonlyArray<StreamExpressionNode>;
      switch (initNode.kind) {
        case NodeKind.UndefinedLiteral:
        case NodeKind.NumberLiteral:
        case NodeKind.TextLiteral:
        case NodeKind.BooleanLiteral:
        case NodeKind.StreamReference:
          origStreamChildren = [];
          break;

        case NodeKind.ArrayLiteral:
          origStreamChildren = initNode.elems;
          break;

        case NodeKind.Application:
          origStreamChildren = initNode.sargs;
          break;

        default: {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const exhaustive: never = initNode; // this will cause a type error if we haven't handled all cases
          throw new Error();
        }
      }

      switch (choice.type) {
        case 'undefined':
          newNode = {
            kind: NodeKind.UndefinedLiteral,
            sid: newSid,
          };
          break;

        case 'number':
          newNode = {
            kind: NodeKind.NumberLiteral,
            sid: newSid,
            val: choice.value,
          };
          break;

        case 'text':
          newNode = {
            kind: NodeKind.TextLiteral,
            sid: newSid,
            val: choice.value,
          };
          break;

        case 'boolean':
          newNode = {
            kind: NodeKind.BooleanLiteral,
            sid: newSid,
            val: choice.value,
          };
          break;

        case 'bind':
          newNode = {
            kind: NodeKind.Application,
            aid: generateApplicationId(),
            outs: [{sid: newSid, name: {kind: NodeKind.Name, text: choice.name}}],
            func: {
              kind: NodeKind.FunctionReference,
              ref: 'bind',
            },
            sargs: (origStreamChildren.length > 0) ? [origStreamChildren[0]] : [{
              kind: NodeKind.UndefinedLiteral,
              sid: generateStreamId(),
            }],
            fargs: [],
          };
          break;

        case 'streamref':
          newNode = {
            kind: NodeKind.StreamReference,
            ref: choice.sid,
          };
          break;

        case 'app': {
          const retIdx = functionReturnedIndex(choice.funcDefNode);

          const outs: ReadonlyArray<ApplicationOut> = choice.funcDefNode.sig.yields.map((_, idx) => {
            const thisYieldReturned = (idx === retIdx);
            return {
              sid: thisYieldReturned ? newSid : generateStreamId(),
              name: thisYieldReturned ? null : {
                kind: NodeKind.Name,
                text: '',
              },
            };
          });

          const sargs: ReadonlyArray<StreamExpressionNode> = choice.funcDefNode.sig.streamParams.map((_, idx) => (
            (idx < origStreamChildren.length) ? origStreamChildren[idx] : {
              kind: NodeKind.UndefinedLiteral,
              sid: generateStreamId(),
            }
          ));

          const fargs: ReadonlyArray<FunctionExpressionNode> = choice.funcDefNode.sig.funcParams.map((param: SignatureFunctionParameterNode) => {
            return {
              kind: NodeKind.TreeFunctionDefinition,
              fid: generateFunctionId(),
              sig: param.sig,
              format: '',
              sparams: param.templateNames.streamParams.map(name => ({
                kind: NodeKind.StreamParameter,
                sid: generateStreamId(),
                name: { kind: NodeKind.Name, text: name },
              })),
              fparams: param.templateNames.funcParams.map(name => ({
                kind: NodeKind.FunctionParameter,
                fid: generateFunctionId(),
                name: { kind: NodeKind.Name, text: name },
              })),
              body: {
                kind: NodeKind.TreeFunctionBody,
                exprs: param.templateNames.yields.map((name, idx) => ({
                  kind: NodeKind.YieldExpression,
                  idx,
                  name: { kind: NodeKind.Name, text: name },
                  expr: {
                    kind: NodeKind.UndefinedLiteral,
                    sid: generateStreamId(),
                  },
                })),
              },
            }
          });

          const n: ApplicationNode = {
            kind: NodeKind.Application,
            aid: generateApplicationId(),
            outs,
            func: {
              kind: NodeKind.FunctionReference,
              ref: choice.funcDefNode.fid,
            },
            sargs,
            fargs,
          };
          newNode = n;
          break;
        }

        default: {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const exhaustive: never = choice; // this will cause a type error if we haven't handled all cases
          throw new Error();
        }
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
      const initElemNode: UndefinedLiteralNode = {
        kind: NodeKind.UndefinedLiteral,
        sid: generateStreamId(),
      };
      const newArrNode: ArrayLiteralNode = {
        kind: NodeKind.ArrayLiteral,
        aid: generateApplicationId(),
        sid: generateStreamId(),
        elems: [initElemNode],
      };
      dispatch({type: 'UPDATE_EDITING_NODE', newNode: newArrNode});
      dispatch({type: 'TOGGLE_EDIT'});
      dispatch({type: 'SET_SELECTED_NODE', newNode: initElemNode});
      dispatch({type: 'TOGGLE_EDIT'});
    } else {
      setText(newText);
      setDropdownState(recomputeDropdownChoices(newText));
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault(); // we don't want the default behavior of moving the cursor
        e.stopPropagation();
        adjustDropdownIndex(-1);
        break;

      case 'ArrowDown':
        e.preventDefault(); // we don't want the default behavior of moving the cursor
        e.stopPropagation();
        adjustDropdownIndex(1);
        break;

      default:
        // do nothing
        break;
    }
  };

  return (
    <div className="Chooser">
      <input className="Chooser-input" value={text} onChange={onChange} onKeyDown={onKeyDown} ref={inputRef} autoFocus />
      <ul className="Chooser-dropdown">
        {dropdownState.choices.map((choice, idx) => {
          const classNames = [];
          if (idx === dropdownState.index) {
            if (compileError) {
              classNames.push('Chooser-dropdown-selected-error');
            } else {
              classNames.push('Chooser-dropdown-selected');
            }
          }
          return (
            <li key={idx} className={classNames.join(' ')} ref={(idx === dropdownState.index) ? selectedListElem : undefined}>
              <Choice choice={choice} />
              {(compileError && (idx === dropdownState.index)) ?
                <div className="Chooser-dropdown-compile-error">{compileError}</div>
              : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const NameChooser: React.FC<{initSelTree: SelTree, dispatch: (action: any) => void}> = ({ initSelTree, dispatch }) => {
  const initNode = initSelTree.selectedNode;
  if (initNode.kind !== NodeKind.Name) {
    throw new Error();
  }

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current && inputRef.current.select();
  }, []);

  const [text, setText] = useState(() => {
    return initNode.text;
  });

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newText = e.target.value;

    setText(newText);

    const newNode: NameNode = {
      ...initNode,
      text: newText,
    };
    dispatch({type: 'UPDATE_EDITING_NODE', newNode: newNode});
  };

  return (
    <div className="Chooser">
      <input className="Chooser-input" value={text} onChange={onChange} ref={inputRef} autoFocus />
    </div>
  );
}

const Chooser: React.FC<{initSelTree: SelTree, nativeFunctions: ReadonlyArray<NativeFunctionDefinitionNode>, dispatch: (action: any) => void, compileError: string | undefined}> = ({ initSelTree, nativeFunctions, dispatch, compileError }) => {
  if (initSelTree.selectedNode.kind === NodeKind.Name) {
    return <NameChooser initSelTree={initSelTree} dispatch={dispatch} />
  } else if (isStreamExpressionNode(initSelTree.selectedNode)) {
    return <ExpressionChooser initSelTree={initSelTree} nativeFunctions={nativeFunctions} dispatch={dispatch} compileError={compileError} />
  } else {
    throw new Error();
  }
}

export default Chooser;
