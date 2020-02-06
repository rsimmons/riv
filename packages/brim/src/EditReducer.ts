import genuid from './uid';
import { State, ProgramInfo, SelTree } from './State';
import { StreamID, FunctionID, generateStreamId, generateFunctionId, NodeKind, Node, TreeFunctionDefinitionNode, FunctionDefinitionNode, isFunctionDefinitionNode, StreamExpressionNode, NativeFunctionDefinitionNode, isStreamExpressionNode, UndefinedLiteralNode, BodyExpressionNode, generateApplicationId, NameNode, StreamParameterNode, ArrayLiteralNode, TreeFunctionBodyNode } from './Tree';
import { CompiledDefinition } from './CompiledDefinition';
import { compileGlobalTreeDefinition, CompilationError } from './Compiler';
import { createNullaryVoidRootExecutionContext, beginBatch, endBatch } from 'riv-runtime';
import { createLiveFunction } from './LiveFunction';
import Environment from './Environment';
import { iterChildren, visitChildren, replaceChild, transformChildren } from './Traversal';
import globalNativeFunctions from './globalNatives';

// We don't make a discriminated union of specific actions, but maybe we could
interface Action {
  type: string;
  char?: string;
  newNode?: Node;
  newName?: string;
  newProgram?: any;
}

/*
function cutExpressionNode(program: ProgramNode, selectionPath: Path): [ProgramNode, Path] {
  let cutNode: ExpressionNode | undefined;
  let holeNode: ExpressionNode | undefined; // the "hole" after we remove

  let newProgram = traverseTree(program, {alongPath: selectionPath}, (node, path) => {
    if (equiv(path, selectionPath)) {
      // We are at the node to be cut
      if (!isExpressionNode(node)) {
        throw new Error();
      }
      if (cutNode) {
        throw new Error(); // sanity check
      }

      cutNode = node;

      holeNode = {
        type: 'UndefinedExpression',
        streamId: genuid(),
        identifier: null,
      };

      return [false, holeNode];
    } else if (isUserFunctionNode(node)) {
      if (cutNode) {
        // Move the node to the top level of this function definition
        const selectionPathAfter = selectionPath.slice(path.length);
        if ((selectionPathAfter.length < 2) || (selectionPathAfter[0] !== 'expressions')) {
          throw new Error();
        }
        const idx = selectionPathAfter[1];
        if (typeof(idx) !== 'number') {
          throw new Error();
        }

        const newNode = {
          ...node,
          expressions: [
            ...node.expressions.slice(0, idx),
            cutNode,
            ...node.expressions.slice(idx),
          ],
        };
        cutNode = undefined;

        return [false, newNode];
      }
    }

    return [false, node];
  });

  if (newProgram.type !== 'Program') {
    throw new Error(); // sanity check
  }

  if (!holeNode) {
    throw new Error();
  }

  const nodeToPath = computeNodeToPathMap(newProgram);
  const newSelectionPath = nodeToPath.get(holeNode);
  if (!newSelectionPath) {
    throw new Error();
  }

  return [newProgram, newSelectionPath];
}

function pasteExpressionNode(pasteNode: ExpressionNode, pasteStreamId: StreamID, program: ProgramNode, selectionPath: Path): [ProgramNode, Path] {
  let newProgram = traverseTree(program, {}, (node, path) => {
    if (equiv(path, selectionPath)) {
      // We are at the node to be pasted over
      if (!isExpressionNode(node)) {
        throw new Error();
      }

      return [false, pasteNode];
    } else if (isUserFunctionNode(node)) {
      // NOTE: We assume that the node must be at the top level of a function definition.
      let removeIdx;
      node.expressions.forEach((expr, idx) => {
        if (expr.streamId === pasteStreamId) {
          // This is the node to remove
          removeIdx = idx;
        }
      });

      if (removeIdx !== undefined) {
        const [newNode, , ] = deleteDefinitionExpression(node, removeIdx);
        return [false, newNode];
      }
    }

    return [false, node];
  });

  if (newProgram.type !== 'Program') {
    throw new Error(); // sanity check
  }

  const nodeToPath = computeNodeToPathMap(newProgram);
  const newSelectionPath = nodeToPath.get(pasteNode);
  if (!newSelectionPath) {
    throw new Error();
  }

  return [newProgram, newSelectionPath];
}

function firstUndefinedNode(node: Node, after: Path | undefined = undefined): [Node, Path] | undefined {
  let passed = false; // have we passed the "after" path?
  let result: [Node, Path] | undefined;

  traverseTree(node, {}, (node, path) => {
    if (after && pathIsPrefix(after, path)) {
      passed = true;
    }

    if (node.type === 'UndefinedLiteral') {
      if (passed || !after) {
        result = [node, path];
        return [true, node];
      }
    }
    return [false, node];
  });

  return result;
}

*/

interface ExprStreamDefinition {
  kind: 'expr';
  sid: StreamID;
  name: NameNode;

  expr: StreamExpressionNode;
}

interface ParamStreamDefinition {
  kind: 'param';
  sid: StreamID;
  name: NameNode;

  param: StreamParameterNode;
}

export type StreamDefinition = ExprStreamDefinition | ParamStreamDefinition;

export interface StaticEnvironment {
  streamEnv: Environment<StreamID, StreamDefinition>;
  functionEnv: Environment<FunctionID, FunctionDefinitionNode>;
}

export function initStaticEnv(globalFunctions: ReadonlyArray<FunctionDefinitionNode>): StaticEnvironment {
  const globalFunctionEnv: Environment<FunctionID, FunctionDefinitionNode> = new Environment();
  for (const fdef of globalFunctions) {
    globalFunctionEnv.set(fdef.fid, fdef);
  }

  return {
    streamEnv: new Environment(),
    functionEnv: globalFunctionEnv,
  };
}

export function extendStaticEnv(outer: StaticEnvironment, def: TreeFunctionDefinitionNode): StaticEnvironment {
  const streamEnv: Environment<StreamID, StreamDefinition> = new Environment(outer.streamEnv);
  const functionEnv: Environment<FunctionID, FunctionDefinitionNode> = new Environment(outer.functionEnv);

  def.sparams.forEach(sparam => {
    const {sid, name} = sparam;
    if (streamEnv.has(sid)) {
      throw new Error();
    }
    streamEnv.set(sid, {
      kind: 'param',
      sid,
      name,
      param: sparam,
    });
  });

  const visit = (node: Node): void => {
    if (isStreamExpressionNode(node)) {
      if (node.kind === NodeKind.Application) {
        node.outs.forEach(out => {
          if (streamEnv.has(out.sid)) {
            throw new Error('stream ids must be unique');
          }
          if (out.name) {
            streamEnv.set(out.sid, {
              kind: 'expr',
              sid: out.sid,
              name: out.name,
              expr: node,
            });
          }
        });
      }
    }

    if (isFunctionDefinitionNode(node)) {
      if (functionEnv.has(node.fid)) {
        throw new Error('function ids must be unique');
      }
      functionEnv.set(node.fid, node);
    } else {
      visitChildren(node, visit, undefined);
    }
  };

  visitChildren(def.body, visit, undefined);

  return {
    streamEnv,
    functionEnv,
  };
}

export function getStaticEnvForSelected(selTree: SelTree, nativeFunctions: ReadonlyArray<NativeFunctionDefinitionNode>): StaticEnvironment {
  let selectedNodeEnv: StaticEnvironment | undefined;

  const visit = (node: Node, env: StaticEnvironment): void => {
    let newEnv: StaticEnvironment;
    if (node.kind === NodeKind.TreeFunctionDefinition) {
      newEnv = extendStaticEnv(env, node);
    } else {
      newEnv = env;
    }

    if (node === selTree.selectedNode) {
      selectedNodeEnv = newEnv;
    }

    visitChildren(node, visit, newEnv);
  };

  visit(selTree.mainDefinition, initStaticEnv(nativeFunctions));

  if (!selectedNodeEnv) {
    throw new Error();
  }

  return selectedNodeEnv;
}

export function getReferentNameNodeOfSelected(selTree: SelTree, nativeFunctions: ReadonlyArray<NativeFunctionDefinitionNode>): NameNode | undefined {
  const selectedEnv = getStaticEnvForSelected(selTree, nativeFunctions);

  const node = selTree.selectedNode;
  if (node.kind === NodeKind.StreamReference) {
    const streamDef = selectedEnv.streamEnv.get(node.ref);
    if (!streamDef) {
      throw new Error();
    }

    switch (streamDef.kind) {
      case 'expr':
        return streamDef.name;

      case 'param':
        return streamDef.name;

      default: {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const exhaustive: never = streamDef; // this will cause a type error if we haven't handled all cases
      }
    }
  }
}

/**
 * Note that this returns the new _root_ of the whole tree
 */
function replaceNode(node: Node, newNode: Node, parentLookup: Map<Node, Node>): Node {
  const parent = parentLookup.get(node);
  if (!parent) {
    return newNode;
  }
  return replaceNode(parent, replaceChild(parent, node, newNode), parentLookup);
}

function deleteNodeSubtree(node: Node, parentLookup: Map<Node, Node>): SelTree | void {
  const deleteFromArr = <T extends Node>(nodeToRemove: T, arr: ReadonlyArray<T>): [ReadonlyArray<T>, T | undefined] => {
    const idx = arr.indexOf(nodeToRemove);
    if (idx < 0) {
      throw new Error();
    }

    const newArr = arr.slice(0, idx).concat(arr.slice(idx + 1));

    let newSibSel: T | undefined;
    if (newArr.length === 0) {
      newSibSel = undefined;
    } else if (idx === (arr.length - 1)) {
      newSibSel = newArr[idx-1];
    } else {
      newSibSel = newArr[idx];
    }

    return [newArr, newSibSel];
  };

  const parent = parentLookup.get(node);

  if (!parent) {
    return;
  }

  if (isStreamExpressionNode(node)) {
    if ((parent.kind === NodeKind.Application) || (parent.kind === NodeKind.YieldExpression)) {
      const newNode: UndefinedLiteralNode = {
        kind: NodeKind.UndefinedLiteral,
        sid: generateStreamId(),
      };
      const newRoot = replaceNode(node, newNode, parentLookup);
      if (newRoot.kind !== NodeKind.TreeFunctionDefinition) {
        throw new Error();
      }
      return {
        mainDefinition: newRoot,
        selectedNode: newNode,
      };
    } else if (parent.kind === NodeKind.ArrayLiteral) {
      const [newElems, newSibSel] = deleteFromArr(node, parent.elems);
      const newParent: ArrayLiteralNode = {
        ...parent,
        elems: newElems,
      };
      const newRoot = replaceNode(parent, newParent, parentLookup);
      if (newRoot.kind !== NodeKind.TreeFunctionDefinition) {
        throw new Error();
      }
      return {
        mainDefinition: newRoot,
        selectedNode: newSibSel || newParent,
      };
    } else if (parent.kind === NodeKind.TreeFunctionBody) {
      const [newExprs, newSibSel] = deleteFromArr(node, parent.exprs);
      const newParent: TreeFunctionBodyNode = {
        ...parent,
        exprs: newExprs,
      };
      const newRoot = replaceNode(parent, newParent, parentLookup);
      if (newRoot.kind !== NodeKind.TreeFunctionDefinition) {
        throw new Error();
      }
      return {
        mainDefinition: newRoot,
        selectedNode: newSibSel || newParent,
      };
    } else {
      throw new Error();
    }
  }
}

function handleInstantEditAction(action: Action, selTree: SelTree, parentLookup: Map<Node, Node>): SelTree | void {
  switch (action.type) {
    case 'DELETE_SUBTREE':
      return deleteNodeSubtree(selTree.selectedNode, parentLookup);
  }
}

export function computeParentLookup(root: Node): Map<Node, Node> {
  const parent: Map<Node, Node> = new Map();

  const visit = (node: Node): void => {
    for (const child of iterChildren(node)) {
      parent.set(child, node);
    }

    visitChildren(node, visit, undefined);
  };

  visit(root);

  return parent;
}

function canBeginEditOnNode(node: Node) {
  return isStreamExpressionNode(node) || (node.kind === NodeKind.Name);
}

function attemptBeginEditSelected(state: State): State {
  if (canBeginEditOnNode(state.stableSelTree.selectedNode)) {
    return {
      ...state,
      editing: {
        sessionId: genuid(),
        initSelTree: state.stableSelTree,
        curSelTree: state.stableSelTree,
        compileError: undefined, // we assume
        isInsert: false,
        infixMode: false,
      },
    };
  } else {
    console.log('Can\'t edit this node');
    return state;
  }
}

function arrInsertBeforeAfter<T>(arr: ReadonlyArray<T>, idx: number, before: boolean, elem: T) {
  const newIdx = before ? idx : idx+1;
  return [
    ...arr.slice(0, newIdx),
    elem,
    ...arr.slice(newIdx),
  ];
}

function attemptInsertBeforeAfter(state: State, before: boolean): State {
  const parentLookup = computeParentLookup(state.stableSelTree.mainDefinition); // TODO: memoize

  let n: Node = state.stableSelTree.selectedNode;
  while (true) {
    const parent = parentLookup.get(n);
    if (!parent) {
      return state;
    }

    if (parent.kind === NodeKind.ArrayLiteral) {
      const idx = parent.elems.indexOf(n as StreamExpressionNode);
      const newElem: UndefinedLiteralNode = {
        kind: NodeKind.UndefinedLiteral,
        sid: generateStreamId(),
      };
      const newArrNode = {
        ...parent,
        elems: arrInsertBeforeAfter(parent.elems, idx, before, newElem),
      };
      const newMain = replaceNode(parent, newArrNode, parentLookup);
      if (newMain.kind !== NodeKind.TreeFunctionDefinition) {
        throw new Error();
      }
      const initSelTree = {
        mainDefinition: newMain,
        selectedNode: newElem,
      };
      return {
        ...state,
        editing: {
          sessionId: genuid(),
          initSelTree,
          curSelTree: initSelTree,
          compileError: undefined, // TODO: assumed, not sure if guaranteed safe
          isInsert: true,
          infixMode: false,
        },
      };
    } else if (parent.kind === NodeKind.TreeFunctionBody) {
      const idx = parent.exprs.indexOf(n as BodyExpressionNode);
      const newElem: UndefinedLiteralNode = {
        kind: NodeKind.UndefinedLiteral,
        sid: generateStreamId(),
      };
      const newBodyNode = {
        ...parent,
        exprs: arrInsertBeforeAfter(parent.exprs, idx, before, newElem),
      };
      const newMain = replaceNode(parent, newBodyNode, parentLookup);
      if (newMain.kind !== NodeKind.TreeFunctionDefinition) {
        throw new Error();
      }
      const initSelTree = {
        mainDefinition: newMain,
        selectedNode: newElem,
      };
      return {
        ...state,
        editing: {
          sessionId: genuid(),
          initSelTree,
          curSelTree: initSelTree,
          compileError: undefined, // TODO: assumed, not sure if guaranteed safe
          isInsert: true,
          infixMode: false,
        },
      };
    } else {
      n = parent;
    }
  }
}

function pushUndo(state: State): State {
  return {
    ...state,
    undoStack: state.undoStack.concat([state.stableSelTree]),
  };
}

function fixupDanglingRefs(selTree: SelTree, nativeFunctions: ReadonlyArray<NativeFunctionDefinitionNode>): SelTree {
  const globalEnv = initStaticEnv(nativeFunctions);

  const oldNodeToNew: Map<Node, Node> = new Map();

  const transform = (node: Node, env: StaticEnvironment): Node => {
    let newNode: Node = node;
    if (node.kind === NodeKind.StreamReference) {
      const streamDef = env.streamEnv.get(node.ref);
      if (!streamDef) {
        newNode = {
          kind: NodeKind.UndefinedLiteral,
          sid: generateStreamId(),
        };
      }
    }

    let newEnv: StaticEnvironment;
    if (node.kind === NodeKind.TreeFunctionDefinition) {
      newEnv = extendStaticEnv(env, node);
    } else {
      newEnv = env;
    }

    const newNewNode = transformChildren(newNode, transform, newEnv);

    if (newNewNode !== node) {
      oldNodeToNew.set(node, newNewNode);
    }

    return newNewNode;
  };

  const newMain = transform(selTree.mainDefinition, globalEnv);
  if (newMain.kind !== NodeKind.TreeFunctionDefinition) {
    throw new Error();
  }

  const newSelectedNode = oldNodeToNew.get(selTree.selectedNode) || selTree.selectedNode;
  // TODO: verify that newSelectedNode is in newMain

  // console.log('fixupDanglingRefs', 'tree changed?', newMain !== selTree.mainDefinition, 'selnode changed?', newSelectedNode !== selTree.selectedNode);

  return {
    mainDefinition: newMain,
    selectedNode: newSelectedNode,
  };
}

// NOTE: May throw a compiler exception
function compileSelTree(selTree: SelTree, nativeFunctions: ReadonlyArray<NativeFunctionDefinitionNode>): CompiledDefinition {
  // NOTE: We could avoid repeating this work, but this is sort of temporary anyways
  const globalFunctionEnvironment: Environment<FunctionID, FunctionDefinitionNode> = new Environment();
  for (const nf of nativeFunctions) {
    globalFunctionEnvironment.set(nf.fid, nf);
  }

  return compileGlobalTreeDefinition(selTree.mainDefinition, globalFunctionEnvironment);
}

function updateExecution(state: State, newCompiledDefinition: CompiledDefinition): State {
  if (state.execution) {
    const { updateCompiledDefinition } = state.execution;

    beginBatch();
    updateCompiledDefinition(newCompiledDefinition);
    endBatch();

    return state;
  } else {
    // There is no old state, so we need to create the long-lived stuff
    const [liveStreamFunc, updateCompiledDefinition] = createLiveFunction(newCompiledDefinition, new Environment(), nativeFunctionEnvironment);
    const context = createNullaryVoidRootExecutionContext(liveStreamFunc);

    context.update(); // first update that generally kicks off further async updates

    return {
      ...state,
      execution: {
        context,
        compiledDefinition: newCompiledDefinition,
        updateCompiledDefinition,
      },
    };
  }
}

// If the given seltree compiles, make it the new stable one and update execution. Otherwise keep current stable one.
// Also, end any edit.
function attemptCommitEdit(state: State, newSelTree: SelTree): State {
  const fixedSelTree = fixupDanglingRefs(newSelTree, state.nativeFunctions);

  let compiledDefinition: CompiledDefinition | undefined;
  try {
    compiledDefinition = compileSelTree(fixedSelTree, state.nativeFunctions);
  } catch (e) {
    if (e instanceof CompilationError) {
      compiledDefinition = undefined;
    } else {
      throw e;
    }
  }

  if (compiledDefinition) {
    return updateExecution({
      ...state,
      stableSelTree: fixedSelTree,
      editing: null,
    }, compiledDefinition);
  } else {
    return {
      ...state,
      editing: null,
    };
  }
}

function nodeIsHole(node: Node): boolean {
  return (node.kind === NodeKind.UndefinedLiteral) ||
   ((node.kind === NodeKind.Name) && !node.text);
}

function findNextHoleUnder(node: Node): Node | undefined {
  for (const child of iterChildren(node)) {
    if (nodeIsHole(child)) {
      return child;
    } else {
      const recur = findNextHoleUnder(child);
      if (recur) {
        return recur;
      }
    }
  }
}

function attemptChainEdit(state: State, tryInsert: boolean): State {
  const editNode = (node: Node): State => {
    const editSelTree = {
      mainDefinition: state.stableSelTree.mainDefinition,
      selectedNode: node,
    };
    return {
      ...state,
      editing: {
        sessionId: genuid(),
        initSelTree: editSelTree,
        curSelTree: editSelTree,
        compileError: undefined,
        isInsert: false,
        infixMode: false,
      },
    };
  };

  if (state.editing) {
    throw new Error(); // shouldn't be
  }

  const parentLookup = computeParentLookup(state.stableSelTree.mainDefinition);

  const under = findNextHoleUnder(state.stableSelTree.selectedNode);
  if (under) {
    return editNode(under);
  }

  let n: Node = state.stableSelTree.selectedNode;
  while (true) {
    const parent = parentLookup.get(n);
    if (!parent) {
      return state; // reached root, do nothing
    }
    if ((parent.kind === NodeKind.ArrayLiteral) || (parent.kind === NodeKind.TreeFunctionBody)) {
      if (tryInsert) {
        return attemptInsertBeforeAfter(state, false);
      } else {
        return state;
      }
    } else {
      const parentsChildren = [...iterChildren(parent)];
      const nodeIdx = parentsChildren.indexOf(n);
      if (nodeIdx < 0) {
        throw new Error();
      }
      for (let i = nodeIdx+1; i < parentsChildren.length; i++) {
        const sib = parentsChildren[i];
        if (sib.kind === NodeKind.UndefinedLiteral) {
          return editNode(sib);
        }
        const under = findNextHoleUnder(sib);
        if (under) {
          return editNode(under);
        }
      }

      n = parent;
    }
  }
}

export function reducer(state: State, action: Action): State {
  console.log('action', action);

  if (action.type === 'LOAD_PROGRAM') {
    if (!action.newProgram) {
      throw new Error();
    }

    // Terminate currently running main function
    if (!state.execution) {
      throw new Error();
    }
    state.execution.context.terminate();

    return initialStateFromDefinition(action.newProgram.mainDefinition, action.newProgram.info as ProgramInfo);
  } else if (action.type === 'SET_PROGRAM_NAME') {
    return {
      ...state,
      programInfo: {
        ...state.programInfo,
        name: action.newName!,
      },
    };
  } else if (action.type === 'BEGIN_EDIT') {
    if (!state.editing) {
      return attemptBeginEditSelected(state);
    }
  } else if (action.type === 'INSERT_BEFORE') {
    if (!state.editing) {
      return attemptInsertBeforeAfter(state, true);
    }
  } else if (action.type === 'INSERT_AFTER') {
    if (!state.editing) {
      return attemptInsertBeforeAfter(state, false);
    }
  } else if (action.type === 'TOGGLE_EDIT') {
    if (state.editing) {
      const insertAgain = state.editing.isInsert;
      const stateAfterCommit = attemptCommitEdit({
        ...pushUndo(state),
      }, state.editing.curSelTree);

      return attemptChainEdit(stateAfterCommit, insertAgain);
    } else {
      return attemptBeginEditSelected(state);
    }
  } else if (action.type === 'INFIX_EDIT') {
    if (state.editing) {
      return {
        ...state,
        editing: {
          sessionId: genuid(),
          initSelTree: state.editing.curSelTree,
          curSelTree: state.editing.curSelTree,
          compileError: undefined, // we assume?
          isInsert: false,
          infixMode: true,
        },
      };
    } else {
      return {
        ...state,
        editing: {
          sessionId: genuid(),
          initSelTree: state.stableSelTree,
          curSelTree: state.stableSelTree,
          compileError: undefined, // we assume?
          isInsert: false,
          infixMode: true,
        },
      };
    }
  } else if (action.type === 'ABORT_EDIT') {
    if (state.editing) {
      return {
        ...state,
        editing: null,
      };
    }
  } else if (action.type === 'UPDATE_EDITING_NODE') {
    if (!state.editing) {
      throw new Error();
    }
    const parentLookup = computeParentLookup(state.editing.initSelTree.mainDefinition); // TODO: memoize
    const newMain = replaceNode(state.editing.initSelTree.selectedNode, action.newNode!, parentLookup);
    if (newMain.kind !== NodeKind.TreeFunctionDefinition) {
      throw new Error();
    }

    const fixedSelTree = fixupDanglingRefs({mainDefinition: newMain, selectedNode: action.newNode!}, state.nativeFunctions);

    // Check if tentative tree compiles
    let compileError: string | undefined;
    try {
      compileSelTree(fixedSelTree, state.nativeFunctions);
      compileError = undefined;
    } catch (e) {
      if (e instanceof CompilationError) {
        compileError = 'cyclic reference';
      } else {
        throw e;
      }
    }

    return {
      ...state,
      editing: {
        ...state.editing,
        curSelTree: fixedSelTree,
        compileError,
      },
    };
  } else if (action.type === 'UNDO') {
    if (state.undoStack.length > 0) {
      const newSelTree = state.undoStack[state.undoStack.length-1];
      return attemptCommitEdit({
        ...state,
        undoStack: state.undoStack.slice(0, state.undoStack.length-1),
      }, newSelTree);
    } else {
      console.log('nothing to undo');
      return state;
    }
  } else if (action.type === 'SET_SELECTED_NODE') {
    const newSelectedNode = action.newNode!;
    if (newSelectedNode !== state.stableSelTree.selectedNode) {
      return {
        ...state,
        stableSelTree: {
          ...state.stableSelTree,
          selectedNode: newSelectedNode,
        },
        editing: null, // abort any edits
      };
    } else {
      return state;
    }
  }

  const parentLookup = computeParentLookup(state.stableSelTree.mainDefinition); // TODO: memoize
  const handleEditActionResult = handleInstantEditAction(action, state.stableSelTree, parentLookup);
  if (handleEditActionResult) {
    const newSelTree = handleEditActionResult;

    if (newSelTree !== state.stableSelTree) {
      return attemptCommitEdit({
        ...pushUndo(state),
      }, newSelTree);
    } else {
      return state;
    }
  } else if (action.type === 'CUT') {
    /*
    const selectedNode = nodeFromPath(newProgram, newSelectionPath);
    if (isExpressionNode(selectedNode)) {
      newClipboardStack = newClipboardStack.concat([{
        mode: 'cut',
        streamId: selectedNode.streamId,
      }]);
      [newProgram, newSelectionPath] = cutExpressionNode(newProgram, newSelectionPath);
    }
    */
  } else if (action.type === 'PASTE') {
    /*
    const selectedNode = nodeFromPath(newProgram, newSelectionPath);
    if ((newClipboardStack.length > 0) && isExpressionNode(selectedNode)) {
      const topFrame = newClipboardStack[newClipboardStack.length-1];
      newClipboardStack = newClipboardStack.slice(0, newClipboardStack.length-1);
      const topNode = state.derivedLookups.streamIdToNode!.get(topFrame.streamId)!;
      [newProgram, newSelectionPath] = pasteExpressionNode(topNode, topFrame.streamId, newProgram, newSelectionPath);
    }
    */
  }

  console.log('action not handled');
  return state;
}

const nativeFunctionEnvironment: Environment<FunctionID, Function> = new Environment();
nativeFunctionEnvironment.set('id', (x: any) => x);
nativeFunctionEnvironment.set('Array_of', Array.of);
globalNativeFunctions.forEach(([id, , , jsFunc]) => {
  nativeFunctionEnvironment.set(id, jsFunc);
});

function initialStateFromDefinition(mainDefinition: TreeFunctionDefinitionNode, programInfo: ProgramInfo): State {
  const nativeFunctions: ReadonlyArray<NativeFunctionDefinitionNode> = globalNativeFunctions.map(([fid, format, signature, ]) => ({
    kind: NodeKind.NativeFunctionDefinition,
    fid,
    sig: signature,
    format,
  }));

  const initSelTree = {mainDefinition, selectedNode: mainDefinition};

  const compiledDefinition = compileSelTree(initSelTree, nativeFunctions);

  return updateExecution({
    programInfo,
    stableSelTree: initSelTree,
    editing: null,
    nativeFunctions,
    undoStack: [],
    clipboardStack: [],
    execution: null,
  }, compiledDefinition);
}

const mdId = generateStreamId();
const INITIAL_MAIN: TreeFunctionDefinitionNode = {
  kind: NodeKind.TreeFunctionDefinition,
  fid: generateFunctionId(),
  sig: {
    kind: NodeKind.Signature,
    streamParams: [],
    funcParams: [],
    yields: [],
  },
  format: '',
  sparams: [],
  fparams: [],
  body: {
    kind: NodeKind.TreeFunctionBody,
    exprs: [
      {
        kind: NodeKind.Application,
        aid: generateApplicationId(),
        outs: [{sid: mdId, name: {kind: NodeKind.Name, text: 'md'}}],
        func: {
          kind: NodeKind.FunctionReference,
          ref: 'bind',
        },
        sargs: [
          {
            kind: NodeKind.Application,
            aid: generateApplicationId(),
            outs: [{sid: generateStreamId(), name: null}],
            func: {
              kind: NodeKind.FunctionReference,
              ref: 'mouseDown',
            },
            sargs: [],
            fargs: [],
          },
        ],
        fargs: [],
      },
      {
        kind: NodeKind.Application,
        aid: generateApplicationId(),
        outs: [],
        func: {
          kind: NodeKind.FunctionReference,
          ref: 'showString',
        },
        sargs: [
          {
            kind: NodeKind.Application,
            aid: generateApplicationId(),
            outs: [{sid: generateStreamId(), name: null}],
            func: {
              kind: NodeKind.FunctionReference,
              ref: 'ifte',
            },
            sargs: [
              {
                kind: NodeKind.StreamReference,
                ref: mdId,
              },
              {
                kind: NodeKind.Application,
                aid: generateApplicationId(),
                outs: [{sid: generateStreamId(), name: null}],
                func: {
                  kind: NodeKind.FunctionReference,
                  ref: 'cos',
                },
                sargs: [
                  {
                    kind: NodeKind.NumberLiteral,
                    sid: generateStreamId(),
                    val: 10,
                  },
                ],
                fargs: [],
              },
              {
                kind: NodeKind.NumberLiteral,
                sid: generateStreamId(),
                val: 20,
              },
            ],
            fargs: [],
          },
        ],
        fargs: [],
      },
    ],
  }
};

export const initialState: State = initialStateFromDefinition(INITIAL_MAIN, {id: genuid(), name: 'my program'});
