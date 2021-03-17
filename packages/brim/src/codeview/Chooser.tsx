import React, { useState, useEffect, useRef, useMemo } from 'react';
import './Chooser.css';
import { generateStreamId, FunctionDefinitionNode, NodeKind, isStreamExpressionNode, ApplicationNode, generateFunctionId, StreamExpressionNode, generateApplicationId, ApplicationOutNode, NameNode, isFunctionDefinitionNode, ApplicationArgs, ApplicationArgNode, TextNode } from '../compiler/Tree';
import Fuse from 'fuse.js';
import { computeParentLookup } from './EditReducer';
import { SelTree } from './State';
import { StreamExpressionView, TreeViewContext, FunctionDefinitionView } from './TreeView';
import { functionInterfaceAsPlainText, defaultTreeImplFromFunctionInterface } from '../compiler/FunctionInterface';

interface Choice {
  node: StreamExpressionNode | FunctionDefinitionNode;
}

const ChoiceView: React.FC<{choice: Choice, treeViewCtx: TreeViewContext}> = ({ choice, treeViewCtx }) => {
  if (isStreamExpressionNode(choice.node)) {
    return <StreamExpressionView node={choice.node} ctx={treeViewCtx} />
  } else if (isFunctionDefinitionNode(choice.node)) {
    return <FunctionDefinitionView node={choice.node} ctx={treeViewCtx} />
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const exhaustive: never = choice.node; // this will cause a type error if we haven't handled all cases
    throw new Error();
  }
}

interface DropdownState {
  choices: ReadonlyArray<Choice>;
  index: number;
}

const ExpressionChooser: React.FC<{initSelTree: SelTree, dispatch: (action: any) => void, compileError: string | undefined, infixMode: boolean, treeViewCtx: TreeViewContext}> = ({ initSelTree, dispatch, compileError, infixMode, treeViewCtx }) => {
  const parentLookup = useMemo(() => computeParentLookup(initSelTree.mainDef), [initSelTree.mainDef]);
  const parent = parentLookup.get(initSelTree.selectedNode);
  if (!parent) {
    throw new Error();
  }
  const atRoot = parent.kind === NodeKind.TreeFunctionDefinition;

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
    if (infixMode) {
      return '';
    } else {
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

        case NodeKind.StreamReference:
        case NodeKind.Application:
          return ''; // Don't prefill with text

        default: {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const exhaustive: never = initNode; // this will cause a type error if we haven't handled all cases
          throw new Error();
        }
      }
    }
  });

  const generateChoices = (text: string): ReadonlyArray<Choice> => {
    const choices: Array<Choice> = [];

    // If there is no text, put this first as a sort of default
    if (text === '') {
      choices.push({
        node: {
          kind: NodeKind.UndefinedLiteral,
          sid: generateStreamId(),
        },
      });
    }

    const textAsNumber = Number(text);
    if (!Number.isNaN(textAsNumber)) {
      choices.push({
        node:  {
          kind: NodeKind.NumberLiteral,
          sid: generateStreamId(),
          val: textAsNumber,
        },
      });
    }

    // SEARCH

    // actual node that we will add
    interface SearchItemNodeData {
      kind: 'node';
      node: StreamExpressionNode;
    }

    // function node that we will make an _application_ of
    interface SearchItemFuncData {
      kind: 'func';
      def: FunctionDefinitionNode;
    }

    type SearchItemData = SearchItemNodeData | SearchItemFuncData;

    interface SearchItem {
      name: string;
      data: SearchItemData;
    }

    const searchItems: Array<SearchItem> = [];

    const streamEnv = treeViewCtx.staticEnv.streamEnv;
    streamEnv.forEach((sdef, ) => {
      const selfRef = (sdef.kind === 'expr') && (sdef.expr === initNode);
      if (!selfRef) {
        searchItems.push({
          name: sdef.name || ' ',
          data: {
            kind: 'node',
            node: {
              kind: NodeKind.StreamReference,
              ref: sdef.sid,
            },
          },
        });
      }
    });

    const functionEnv = treeViewCtx.staticEnv.functionEnv;
    functionEnv.forEach(defNode => {
      const defAsText = functionInterfaceAsPlainText(defNode.iface);
      if (atRoot) {
        searchItems.push({
          name: defAsText,
          data: {
            kind: 'func',
            def: defNode,
          },
        });
      } else {
        if (defNode.iface.ret.kind === NodeKind.FIReturn) {
          searchItems.push({
            name: defAsText,
            data: {
              kind: 'func',
              def: defNode,
            },
          });
        }
      }
    });

    for (const bv of [true, false]) {
      searchItems.push({
        name: bv.toString(),
        data: {
          kind: 'node',
          node: {
            kind: NodeKind.BooleanLiteral,
            sid: generateStreamId(),
            val: bv,
          },
        },
      })
    }

    const searchOptions: Fuse.FuseOptions<SearchItem> = {
      keys: ['name'],
      includeScore: true,
    };
    const envStreamSearchResults = (new Fuse(searchItems, searchOptions)).search<SearchItem, true, false>(text);

    for (const result of envStreamSearchResults) {
      // cut off scores worse than this
      if (result.score > 0.25) {
        break;
      }

      switch (result.item.data.kind) {
        case 'node':
          choices.push({node: result.item.data.node});
          break;

        case 'func': {
          const funcDefNode = result.item.data.def;
          const iface = funcDefNode.iface;

          const args: Map<string, ApplicationArgNode> = new Map();

          iface.params.forEach(param => {
            switch (param.kind) {
              case NodeKind.FIStreamParam:
                // TODO: wtf was infixMode doing here before?
                args.set(param.pid, {
                  kind: NodeKind.UndefinedLiteral,
                  sid: generateStreamId(),
                });
                break;

              case NodeKind.FIFunctionParam:
                args.set(param.pid, defaultTreeImplFromFunctionInterface(param.iface));
                break;

              case NodeKind.FIOutParam:
                args.set(param.pid, {
                  kind: NodeKind.ApplicationOut,
                  sid: generateStreamId(),
                  text: '',
                });
                break;

              default: {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const exhaustive: never = param; // this will cause a type error if we haven't handled all cases
                throw new Error();
              }
            }
          });

          const n: ApplicationNode = {
            kind: NodeKind.Application,
            aid: generateApplicationId(),
            fid: funcDefNode.fid,
            args,
            rid: (iface.ret.kind === NodeKind.FIReturn) ? generateStreamId() : undefined,
          };

          choices.push({
            node: n,
          });

          break;
        }

        default: {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const exhaustive: never = result.item.data; // this will cause a type error if we haven't handled all cases
          throw new Error();
        }
      }
    }

    if (atRoot && text.trim() !== '') {
      const args: ApplicationArgs = new Map([
        ['p0', {kind: NodeKind.ApplicationOut, sid: generateStreamId(), text: text.trim()}],
        ['p1', {kind: NodeKind.UndefinedLiteral, sid: generateStreamId()}],
      ]);
      choices.push({
        node: {
          kind: NodeKind.Application,
          aid: generateApplicationId(),
          fid: 'bind',
          args,
          rid: undefined,
        },
      });

      // Create a choice for a new local function definition
      choices.push({
        node: {
          kind: NodeKind.TreeFunctionDefinition,
          fid: generateFunctionId(),
          iface: {
            kind: NodeKind.FunctionInterface,
            name: {kind: NodeKind.Name, text: text.trim()},
            params: [
              {
                kind: NodeKind.FIStreamParam,
                pid: generateStreamId(),
                name: {kind: NodeKind.Name, text: 'param'},
              },
            ],
            ret: {
              kind: NodeKind.FIReturn,
            },
          },
          bodyExprs: [
            {
              kind: NodeKind.YieldExpression,
              out: null,
              expr: {
                kind: NodeKind.UndefinedLiteral,
                sid: generateStreamId(),
              },
            },
          ],
        },
      });
    }

    choices.push({
      node: {
        kind: NodeKind.TextLiteral,
        sid: generateStreamId(),
        val: text,
      },
    });

    if (choices.length === 0) {
      choices.push({
        node: {
          kind: NodeKind.UndefinedLiteral,
          sid: generateStreamId(),
        },
      });
    }

    return choices;
  }

  // Update the expression node to reflect the current choice
  const realizeChoice = (state: DropdownState): void => {
    const choice = state.choices[state.index];

    dispatch({type: 'UPDATE_EDITING_NODE', newNode: choice.node});
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

    setText(newText);
    setDropdownState(recomputeDropdownChoices(newText));
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

      case '=': {
        e.preventDefault();
        e.stopPropagation();

        if (!inputRef.current) {
          throw new Error();
        }

        if (atRoot) {
          const inputText = inputRef.current.value;
          const bindNode: ApplicationNode = {
            kind: NodeKind.Application,
            aid: generateApplicationId(),
            fid: 'bind',
            args: new Map([
              ['p0', {
                kind: NodeKind.ApplicationOut,
                sid: generateStreamId(),
                text: inputText,
              }],
              ['p1', {
                kind: NodeKind.UndefinedLiteral,
                sid: generateStreamId(),
              }],
            ]),
            rid: undefined,
          };
          dispatch({type: 'UPDATE_EDITING_NODE', newNode: bindNode});
          dispatch({type: 'TOGGLE_EDIT'});
        }
        break;
      }

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
              <ChoiceView choice={choice} treeViewCtx={treeViewCtx} />
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
  const selNode = initSelTree.selectedNode;
  if ((selNode.kind !== NodeKind.Name) && (selNode.kind !== NodeKind.ApplicationOut)) {
    throw new Error();
  }
  const initNode: TextNode = selNode;

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

    const newNode = {
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

const Chooser: React.FC<{initSelTree: SelTree, dispatch: (action: any) => void, compileError: string | undefined, infixMode: boolean, treeViewCtx: TreeViewContext}> = ({ initSelTree, dispatch, compileError, infixMode, treeViewCtx }) => {
  if ((initSelTree.selectedNode.kind === NodeKind.Name) || (initSelTree.selectedNode.kind === NodeKind.ApplicationOut)) {
    return <NameChooser initSelTree={initSelTree} dispatch={dispatch} />
  } else if (isStreamExpressionNode(initSelTree.selectedNode)) {
    return <ExpressionChooser initSelTree={initSelTree} dispatch={dispatch} compileError={compileError} infixMode={infixMode} treeViewCtx={treeViewCtx} />
  } else {
    throw new Error();
  }
}

export default Chooser;
