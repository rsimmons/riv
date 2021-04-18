import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Node } from '../compiler/Tree';
import { FunctionDefinitionNode, NodeKind, isStreamExpressionNode, ApplicationNode, StreamExpressionNode, ApplicationArgNode, FunctionInterfaceNode, UID, TextNode, StreamBindingNode } from '../compiler/Tree';
import Fuse from 'fuse.js';
import { getStaticEnvMap, StaticEnvironment } from '../editor/EditorReducer';
import { layoutStreamExpressionNode, TreeViewContext, layoutFunctionDefinitionNode, layoutStreamBindingNode } from './TreeView';
import { functionInterfaceAsPlainText, defaultTreeDefFromFunctionInterface } from '../compiler/FunctionInterface';
import genuid from '../util/uid';
import './Chooser.css';

interface Choice {
  node: StreamExpressionNode | StreamBindingNode | FunctionDefinitionNode;
}

const ChoiceView: React.FC<{choice: Choice, treeViewCtx: TreeViewContext}> = ({ choice, treeViewCtx }) => {
  if (isStreamExpressionNode(choice.node)) {
    const {reactNode} = layoutStreamExpressionNode(choice.node, treeViewCtx);
    return <>{reactNode}</>;
  } else if (choice.node.kind === NodeKind.StreamBinding) {
    const {reactNode} = layoutStreamBindingNode(choice.node, treeViewCtx);
    return <>{reactNode}</>;
  } else if (choice.node.kind === NodeKind.FunctionDefinition) {
    const {reactNode} = layoutFunctionDefinitionNode(choice.node, treeViewCtx);
    return <>{reactNode}</>;
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

function createStreamBinding(name: string): StreamBindingNode {
  return {
    kind: NodeKind.StreamBinding,
    nid: genuid(),
    bexpr: {
      kind: NodeKind.NameBinding,
      nid: genuid(),
      name: {kind: NodeKind.Text, nid: genuid(), text: name},
    },
    sexpr: {
      kind: NodeKind.UndefinedLiteral,
      nid: genuid(),
    },
  };
}

const MultiChooser: React.FC<{context: 'tdef-body' | 'subexp', existingNode: Node | null, localEnv: StaticEnvironment, onCommitChoice: (node: Node) => void}> = ({ context, existingNode, localEnv, onCommitChoice }) => {
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
    if (existingNode) {
      // Initialize text based on node
      switch (existingNode.kind) {
        case NodeKind.NumberLiteral:
          return existingNode.val.toString();

        case NodeKind.TextLiteral:
          return existingNode.val;

        case NodeKind.BooleanLiteral:
          return existingNode.val.toString();

        default:
          return '';
      }
    } else {
      return '';
    }
  });

  const generateChoices = (text: string): ReadonlyArray<Choice> => {
    const choices: Array<Choice> = [];

    // If there is no text, put this first as a sort of default
    if (text === '') {
      choices.push({
        node: {
          kind: NodeKind.UndefinedLiteral,
          nid: genuid(),
        },
      });
    }

    const textAsNumber = Number(text);
    if (!Number.isNaN(textAsNumber)) {
      choices.push({
        node:  {
          kind: NodeKind.NumberLiteral,
          nid: genuid(),
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
      iface: FunctionInterfaceNode;
      fid: UID;
    }

    type SearchItemData = SearchItemNodeData | SearchItemFuncData;

    interface SearchItem {
      name: string;
      data: SearchItemData;
    }

    const searchItems: Array<SearchItem> = [];

    const streamEnv = localEnv.streamEnv;
    streamEnv.forEach((sdef, ) => {
      // TODO: we used to check for a self-reference here. do we still need to?
      searchItems.push({
        name: sdef.name.text || ' ',
        data: {
          kind: 'node',
          node: {
            kind: NodeKind.StreamReference,
            nid: genuid(),
            ref: sdef.nid,
          },
        },
      });
    });

    const functionEnv = localEnv.functionEnv;
    functionEnv.forEach((ifaceNode, fid) => {
      const defAsText = functionInterfaceAsPlainText(ifaceNode);
      if ((context === 'tdef-body') || ifaceNode.output) {
        searchItems.push({
          name: defAsText,
          data: {
            kind: 'func',
            iface: ifaceNode,
            fid,
          },
        });
      }
    });

    for (const bv of [true, false]) {
      searchItems.push({
        name: bv.toString(),
        data: {
          kind: 'node',
          node: {
            kind: NodeKind.BooleanLiteral,
            nid: genuid(),
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
          const {iface, fid} = result.item.data;

          const args: Map<string, ApplicationArgNode> = new Map();

          iface.params.forEach(param => {
            switch (param.kind) {
              case NodeKind.StreamParam:
                // TODO: wtf was infixMode doing here before?
                args.set(param.nid, {
                  kind: NodeKind.UndefinedLiteral,
                  nid: genuid(),
                });
                break;

              case NodeKind.FunctionParam:
                args.set(param.nid, defaultTreeDefFromFunctionInterface(param.iface));
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
            nid: genuid(),
            fid,
            args,
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

    if ((context === 'tdef-body') && text.trim() !== '') {
      choices.push({
        node: createStreamBinding(text.trim()),
      });

      // Create a choice for a new local function definition
      const singleParamId = genuid();
      const singleInternalId = genuid();
      choices.push({
        node: {
          kind: NodeKind.FunctionDefinition,
          nid: genuid(),
          iface: {
            kind: NodeKind.FunctionInterface,
            nid: genuid(),
            name: {kind: NodeKind.Text, nid: genuid(), text: text.trim()},
            params: [
              {
                kind: NodeKind.StreamParam,
                nid: singleParamId,
                bind: {
                  kind: NodeKind.NameBinding,
                  nid: genuid(),
                  name: {kind: NodeKind.Text, nid: genuid(), text: 'param'},
                },
              },
            ],
            output: true,
          },
          impl: {
            kind: NodeKind.TreeImpl,
            nid: genuid(),
            pids: new Map([[singleParamId, singleInternalId]]),
            body: [],
            out: {
              kind: NodeKind.StreamReference,
              nid: genuid(),
              ref: singleInternalId,
            },
          }
        },
      });
    }

    choices.push({
      node: {
        kind: NodeKind.TextLiteral,
        nid: genuid(),
        val: text,
      },
    });

    if (choices.length === 0) {
      choices.push({
        node: {
          kind: NodeKind.UndefinedLiteral,
          nid: genuid(),
        },
      });
    }

    return choices;
  }

  // Update the expression node to reflect the current choice
  const realizeChoice = (state: DropdownState): void => {
    const choice = state.choices[state.index];

    // dispatch({type: 'UPDATE_EDITING_NODE', newNode: choice.node});
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
      case 'Enter':
        onCommitChoice(dropdownState.choices[dropdownState.index].node);
        e.stopPropagation();
        break;

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

        if (context === 'tdef-body') {
          const inputText = inputRef.current.value;
          const newNode = createStreamBinding(inputText);
          // dispatch({type: 'UPDATE_EDITING_NODE', newNode});
          // dispatch({type: 'TOGGLE_EDIT'});
        }
        break;
      }
    }
  };

  return (
    <div className="Chooser">
      <input className="Chooser-input" value={text} onChange={onChange} onKeyDown={onKeyDown} ref={inputRef} autoFocus />
      <ul className="Chooser-dropdown">
        {dropdownState.choices.map((choice, idx) => {
          const classNames = [];
          if (idx === dropdownState.index) {
            if (false/*compileError*/) {
              classNames.push('Chooser-dropdown-selected-error');
            } else {
              classNames.push('Chooser-dropdown-selected');
            }
          }

          // a map from nodes inside our choice to their static env
          const choiceEnvMap = getStaticEnvMap(choice.node, localEnv);
          const choiceViewCtx: TreeViewContext = {
            staticEnvMap: choiceEnvMap,
            onSelectNodeId: () => {},
          };

          return (
            <li key={idx} className={classNames.join(' ')} ref={(idx === dropdownState.index) ? selectedListElem : undefined}>
              <ChoiceView choice={choice} treeViewCtx={choiceViewCtx} />
              {/* {(compileError && (idx === dropdownState.index)) ?
                <div className="Chooser-dropdown-compile-error">{compileError}</div>
              : null} */}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const TextChooser: React.FC<{existingNode: TextNode | null, onCommitChoice: (node: Node) => void}> = ({ existingNode, onCommitChoice }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current && inputRef.current.select();
  }, []);

  const [text, setText] = useState(() => {
    return existingNode ? existingNode.text : '';
  });

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newText = e.target.value;

    setText(newText);

    let newNode: TextNode;
    if (existingNode) {
      newNode = {
        ...existingNode,
        text: newText,
      };
    } else {
      newNode ={
        kind: NodeKind.Text,
        nid: genuid(),
        text: newText,
      };
    }
    // TODO: commit
  };

  return (
    <div className="Chooser">
      <input className="Chooser-input" value={text} onChange={onChange} ref={inputRef} autoFocus />
    </div>
  );
}

const Chooser: React.FC<{context: 'tdef-body' | 'subexp' | 'text', existingNode: Node | null, localEnv: StaticEnvironment, onCommitChoice: (node: Node) => void}> = ({ context, existingNode, localEnv, onCommitChoice }) => {
  if (context === 'text') {
    if (existingNode && (existingNode.kind !== NodeKind.Text)) {
      throw new Error();
    }
    return <TextChooser existingNode={existingNode} onCommitChoice={onCommitChoice} />
  } else {
    return <MultiChooser context={context} existingNode={existingNode} localEnv={localEnv} onCommitChoice={onCommitChoice} />
  }
}

export default Chooser;
