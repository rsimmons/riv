import React, { useState, useEffect, useRef } from 'react';
import { Node, UndefinedLiteralNode } from '../compiler/Tree';
import { FunctionDefinitionNode, NodeKind, isStreamExpressionNode, ApplicationNode, StreamExpressionNode, FunctionInterfaceNode, UID, TextNode, StreamBindingNode } from '../compiler/Tree';
import Fuse from 'fuse.js';
import { getStaticEnvMap, StaticEnvironment } from '../editor/EditorReducer';
import { layoutStreamExpressionNode, TreeViewContext, layoutStreamBindingNode } from './TreeView';
import genuid from '../util/uid';
import './Chooser.css';
import { parseTemplateString, templateToPlainText } from './FITemplate';

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

  const out: UndefinedLiteralNode | null = iface.output ? {
    kind: NodeKind.UndefinedLiteral,
    nid: genuid(),
  } : null;

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
      out,
    }
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

    localEnv.forEach((envValue, sid) => {
      if (envValue.type === null) {
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
      } else {
        const ifaceNode = envValue.type;
        const defAsText = functionInterfaceAsPlainText(ifaceNode);
        if ((context === 'tdef-body') || ifaceNode.output) {
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

          const args: Map<string, StreamExpressionNode> = new Map();

          iface.params.forEach(param => {
            if (param.type === null) {
              args.set(param.nid, {
                kind: NodeKind.UndefinedLiteral,
                nid: genuid(),
              });
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
                kind: NodeKind.Param,
                nid: singleParamId,
                name: {kind: NodeKind.Text, nid: genuid(), text: 'param'},
                type: null,
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
          // TODO: bring this behavior back?
          // const inputText = inputRef.current.value;
          // const newNode = createStreamBinding(inputText);
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

const TextChooser: React.FC<{existingNode: TextNode, onCommitChoice: (node: Node) => void}> = ({ existingNode, onCommitChoice }) => {
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

const Chooser: React.FC<{context: 'tdef-body' | 'subexp' | 'text', existingNode: Node | null, localEnv: StaticEnvironment, onCommitChoice: (node: Node) => void}> = ({ context, existingNode, localEnv, onCommitChoice }) => {
  if (context === 'text') {
    if (!existingNode || (existingNode.kind !== NodeKind.Text)) {
      throw new Error();
    }
    return <TextChooser existingNode={existingNode} onCommitChoice={onCommitChoice} />
  } else {
    return <MultiChooser context={context} existingNode={existingNode} localEnv={localEnv} onCommitChoice={onCommitChoice} />
  }
}

export default Chooser;
