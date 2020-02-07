import React, { useState, useEffect, useRef, useMemo } from 'react';
import './Chooser.css';
import { generateStreamId, FunctionDefinitionNode, NodeKind, isStreamExpressionNode, ApplicationNode, SignatureFunctionParameterNode, generateFunctionId, StreamExpressionNode, generateApplicationId, ApplicationOut, FunctionExpressionNode, NativeFunctionDefinitionNode, UndefinedLiteralNode, ArrayLiteralNode, NameNode, StreamID } from './Tree';
import { functionReturnedIndex } from './TreeUtil';
import Fuse from 'fuse.js';
import { computeParentLookup } from './EditReducer';
import { SelTree } from './State';
import { StreamExpressionView, TreeViewContext } from './TreeView';
import { parseToJustText } from './Format';

interface Choice {
  node: StreamExpressionNode;
}

const FLOAT_REGEX = /^[-+]?(?:\d*\.?\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?$/;

const ChoiceView: React.FC<{choice: Choice, treeViewCtx: TreeViewContext}> = ({ choice, treeViewCtx }) => {
  return (
    <StreamExpressionView node={choice.node} ctx={treeViewCtx} />
  );
}

interface DropdownState {
  choices: ReadonlyArray<Choice>;
  index: number;
}

const ExpressionChooser: React.FC<{initSelTree: SelTree, nativeFunctions: ReadonlyArray<NativeFunctionDefinitionNode>, dispatch: (action: any) => void, compileError: string | undefined, infixMode: boolean, treeViewCtx: TreeViewContext}> = ({ initSelTree, nativeFunctions, dispatch, compileError, infixMode, treeViewCtx }) => {
  const parentLookup = useMemo(() => computeParentLookup(initSelTree.mainDefinition), [initSelTree.mainDefinition]);
  const parent = parentLookup.get(initSelTree.selectedNode);
  if (!parent) {
    throw new Error();
  }
  const atRoot = parent.kind === NodeKind.TreeFunctionBody;

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

    if (FLOAT_REGEX.test(text)) {
      choices.push({
        node:  {
          kind: NodeKind.NumberLiteral,
          sid: generateStreamId(),
          val: Number(text),
        },
      });
    }

    // SEARCH OVER STREAMS
    const streamEnv = treeViewCtx.staticEnv.streamEnv;

    interface EnvStreamSearchItem {
      name: string;
      sid: StreamID;
    }
    const envStreamSearchItems: Array<EnvStreamSearchItem> = [];
    streamEnv.forEach((sdef, ) => {
      const selfRef = (sdef.kind === 'expr') && (sdef.expr === initNode);
      if (!selfRef) {
        envStreamSearchItems.push({
          name: sdef.name.text || ' ',
          sid: sdef.sid,
        });
      }
    });

    const envStreamSearchOptions: Fuse.FuseOptions<EnvStreamSearchItem> = {
      keys: ['name'],
    };
    const envStreamSearchResults = (new Fuse(envStreamSearchItems, envStreamSearchOptions)).search<EnvStreamSearchItem, false, false>(text);

    for (const result of envStreamSearchResults) {
      choices.push({
        node: {
          kind: NodeKind.StreamReference,
          ref: result.sid,
        },
      });
    }

    // SEARCH OVER FUNCTIONS
    const functionEnv = treeViewCtx.staticEnv.functionEnv;

    interface EnvFuncSearchItem {
      name: string;
      def: FunctionDefinitionNode;
    }
    const envFuncSearchItems: Array<EnvFuncSearchItem> = [];

    functionEnv.forEach(defNode => {
      if (defNode.format) {
        const defAsText = parseToJustText(defNode.format);
        if (atRoot) {
          envFuncSearchItems.push({
            name: defAsText,
            def: defNode,
          });
        } else {
          const retIdx = functionReturnedIndex(defNode);
          if (retIdx !== undefined) {
            envFuncSearchItems.push({
              name: defAsText,
              def: defNode,
            });
          }
        }
      }
    });

    const envFuncSearchOptions: Fuse.FuseOptions<EnvFuncSearchItem> = {
      keys: ['name'],
    };
    const envFuncSearchResults = (new Fuse(envFuncSearchItems, envFuncSearchOptions)).search<EnvFuncSearchItem, false, false>(text);

    for (const result of envFuncSearchResults) {
      const funcDefNode = result.def;

      const retIdx = functionReturnedIndex(funcDefNode);

      const outs: ReadonlyArray<ApplicationOut> = funcDefNode.sig.yields.map((_, idx) => {
        const thisYieldReturned = (idx === retIdx);
        return {
          sid: generateStreamId(),
          name: thisYieldReturned ? null : {
            kind: NodeKind.Name,
            text: '',
          },
        };
      });

      const sargs: ReadonlyArray<StreamExpressionNode> = funcDefNode.sig.streamParams.map((_, idx) => (
        (infixMode && (idx === 0))
        ? initNode
        : {
          kind: NodeKind.UndefinedLiteral,
          sid: generateStreamId(),
        }
      ));

      const fargs: ReadonlyArray<FunctionExpressionNode> = funcDefNode.sig.funcParams.map((param: SignatureFunctionParameterNode) => {
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
          ref: funcDefNode.fid,
        },
        sargs,
        fargs,
      };

      choices.push({
        node: n,
      });
    }

    for (const bv of [true, false]) {
      if ((text.length > 0) && bv.toString().startsWith(text)) {
        choices.push({
          node: {
            kind: NodeKind.BooleanLiteral,
            sid: generateStreamId(),
            val: bv,
          },
        });
      }
    }

    choices.push({
      node: {
        kind: NodeKind.TextLiteral,
        sid: generateStreamId(),
        val: text,
      },
    });

    if (atRoot && text.trim() !== '') {
      choices.push({
        node: {
          kind: NodeKind.Application,
          aid: generateApplicationId(),
          outs: [{sid: generateStreamId(), name: {kind: NodeKind.Name, text: text.trim()}}],
          func: {
            kind: NodeKind.FunctionReference,
            ref: 'bind',
          },
          sargs: [
            {
              kind: NodeKind.UndefinedLiteral,
              sid: generateStreamId(),
            },
          ],
          fargs: [],
        },
      });
    }

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
            outs: [{sid: generateStreamId(), name: {kind: NodeKind.Name, text: inputText}}],
            func: {
              kind: NodeKind.FunctionReference,
              ref: 'bind',
            },
            sargs: [
              {
                kind: NodeKind.UndefinedLiteral,
                sid: generateStreamId(),
              },
            ],
            fargs: [],
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

const Chooser: React.FC<{initSelTree: SelTree, nativeFunctions: ReadonlyArray<NativeFunctionDefinitionNode>, dispatch: (action: any) => void, compileError: string | undefined, infixMode: boolean, treeViewCtx: TreeViewContext}> = ({ initSelTree, nativeFunctions, dispatch, compileError, infixMode, treeViewCtx }) => {
  if (initSelTree.selectedNode.kind === NodeKind.Name) {
    return <NameChooser initSelTree={initSelTree} dispatch={dispatch} />
  } else if (isStreamExpressionNode(initSelTree.selectedNode)) {
    return <ExpressionChooser initSelTree={initSelTree} nativeFunctions={nativeFunctions} dispatch={dispatch} compileError={compileError} infixMode={infixMode} treeViewCtx={treeViewCtx} />
  } else {
    throw new Error();
  }
}

export default Chooser;
