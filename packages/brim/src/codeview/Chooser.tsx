import React, { useState, useEffect, useRef } from 'react';
import { Node } from '../compiler/Tree';
import { FunctionDefinitionNode, NodeKind, isStreamExpressionNode, ApplicationNode, StreamExpressionNode, FunctionInterfaceNode, UID, TextNode, StreamBindingNode } from '../compiler/Tree';
import Fuse from 'fuse.js';
import { getStaticEnvMap, StaticEnvironment } from '../compiler/TreeUtil';
import { layoutStreamExpressionNode, TreeViewContext, layoutStreamBindingNode, TreeViewStyling } from './TreeView';
import genuid from '../util/uid';
import { parseTemplateString, templateToPlainText } from './FITemplate';
import './Chooser.css';
import { charIsPrintable } from '../util/misc';

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

export function functionInterfaceAsPlainText(ifaceNode: FunctionInterfaceNode): string {
  if (ifaceNode.template) {
    return templateToPlainText(parseTemplateString(ifaceNode.template, ifaceNode.params));
  } else {
    return ifaceNode.name.text;
  }
}

export function defaultTreeDefFromFunctionInterface(iface: FunctionInterfaceNode): FunctionDefinitionNode {
  const pids: ReadonlyMap<UID, UID> = new Map(iface.params.map(param => [param.nid, genuid()]));

  return {
    kind: NodeKind.FunctionDefinition,
    nid: genuid(),
    iface,
    impl: {
      kind: NodeKind.TreeImpl,
      nid: genuid(),
      pids,
      body: [
        {
          kind: NodeKind.UndefinedLiteral,
          nid: genuid(),
        },
      ],
    }
  };
}

export enum MultiChooserContext {
  Expr,
  ExprOrBind,
  Param,
  // Module?
}

export const MultiChooser: React.FC<{context: MultiChooserContext, existingNode: Node | null, localEnv: StaticEnvironment, treeViewStyling: TreeViewStyling, onCommitChoice: (node: Node) => void, onAbort: () => void}> = ({ context, existingNode, localEnv, treeViewStyling, onCommitChoice, onAbort }) => {
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

  const [infixNode, setInfixNode] = useState<Node | null>(null);

  const generateChoices = (text: string): ReadonlyArray<Choice> => {
    const choices: Array<Choice> = [];

    if (!infixNode) {
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

    localEnv.forEach((envValue, sid) => {
      if (envValue.type === null) {
        if (!infixNode) {
          if (!envValue.name) {
            throw new Error(); // TODO: We might not want to require this, but it works for now
          }
          searchItems.push({
            name: envValue.name.text || ' ',
            data: {
              kind: 'node',
              node: {
                kind: NodeKind.StreamReference,
                nid: genuid(),
                ref: sid,
              },
            },
          });
        }
      } else {
        const ifaceNode = envValue.type;
        if (!infixNode || (ifaceNode.params.length > 0)) {
          const defAsText = functionInterfaceAsPlainText(ifaceNode);
          if ((context === MultiChooserContext.ExprOrBind) || (ifaceNode.output.kind !== NodeKind.Void)) {
            searchItems.push({
              name: defAsText,
              data: {
                kind: 'func',
                iface: ifaceNode,
                fid: sid,
              },
            });
          }
        }
      }
    });

    if (!infixNode) {
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

          const args: Map<string, StreamExpressionNode> = new Map();

          iface.params.forEach((param, idx) => {
            if (param.type === null) {
              if (infixNode && (idx === 0)) {
                if (!isStreamExpressionNode(infixNode)) {
                  throw new Error();
                }
                args.set(param.nid, infixNode);
              } else {
                args.set(param.nid, {
                  kind: NodeKind.UndefinedLiteral,
                  nid: genuid(),
                });
              }
            } else {
              args.set(param.nid, defaultTreeDefFromFunctionInterface(param.type));
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

    if (!infixNode) {
      if ((context === MultiChooserContext.ExprOrBind) && (text.trim() !== '')) {
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
                  kind: NodeKind.Param,
                  nid: singleParamId,
                  name: {kind: NodeKind.Text, nid: genuid(), text: 'param'},
                  type: null,
                },
              ],
              output: {kind: NodeKind.AnyType, nid: genuid()},
            },
            impl: {
              kind: NodeKind.TreeImpl,
              nid: genuid(),
              pids: new Map([[singleParamId, singleInternalId]]),
              body: [
                {
                  kind: NodeKind.UndefinedLiteral,
                  nid: genuid(),
                },
              ],
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
    }

    return choices;
  }

  // Update the expression node to reflect the current choice
  const realizeChoice = (state: DropdownState): void => {
    // const choice = state.choices[state.index];
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

  const commitCurrentChoice = (): void => {
    if (dropdownState.choices.length > 0) {
      onCommitChoice(dropdownState.choices[dropdownState.index].node);
    } else {
      onAbort();
    }
  };

  const INFIX_OPERATOR_CHARS = '.,+-*/^<>=:['; // NOTE: This is very tentative

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Check if we should commit a binding
    if (!infixNode && (e.key === '=')) {
      if (context === MultiChooserContext.ExprOrBind) {
        onCommitChoice(createStreamBinding(text));
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }

    // Check if we should begin an infix choice
    const numberDot = (e.key === '.') && !Number.isNaN(Number(text+e.key)); // don't treat dot as operator if it makes a valid number
    if (!infixNode && INFIX_OPERATOR_CHARS.includes(e.key) && !numberDot) {
      setInfixNode(dropdownState.choices[dropdownState.index].node);
      setText('');
      setDropdownState(recomputeDropdownChoices(''));
      return;
    }

    // Check if we should commit and infix choice
    if (infixNode && charIsPrintable(e.key) && !INFIX_OPERATOR_CHARS.includes(e.key)) {
      commitCurrentChoice();
      return;
    }

    switch (e.key) {
      case 'Enter':
        commitCurrentChoice();
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
            styling: treeViewStyling,
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

export const TextChooser: React.FC<{existingNode: TextNode, onCommitChoice: (node: Node) => void}> = ({ existingNode, onCommitChoice }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current && inputRef.current.select();
  }, []);

  const [text, setText] = useState(() => {
    return existingNode.text;
  });

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newText = e.target.value;

    setText(newText);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'Enter':
        onCommitChoice({...existingNode, text});
        e.stopPropagation();
        break;
    }
  };

  return (
    <div className="Chooser">
      <input className="Chooser-input" value={text} onChange={onChange} onKeyDown={onKeyDown} ref={inputRef} autoFocus />
    </div>
  );
}
