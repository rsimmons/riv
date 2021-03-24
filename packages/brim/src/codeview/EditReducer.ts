import genuid from '../util/uid';
import { State, ProgramInfo, SelTree } from './State';
import { UID, NodeKind, Node, FunctionDefinitionNode, isStreamExpressionNode, UndefinedLiteralNode, FunctionInterfaceNode, NameBindingNode, TreeImplBodyNode, TreeImplNode } from '../compiler/Tree';
import { CompiledDefinition } from '../compiler/CompiledDefinition';
import { compileGlobalTreeDefinition, CompilationError } from '../compiler/Compiler';
import { createNullaryVoidRootExecutionContext, beginBatch, endBatch } from 'riv-runtime';
import { createLiveFunction } from '../runner/LiveFunction';
import Environment from '../util/Environment';
import { iterChildren, visitChildren, replaceChild, transformChildren } from '../compiler/Traversal';
import globalNativeFunctions from '../builtin/globalNatives';

// We don't make a discriminated union of specific actions, but maybe we could
export interface Action {
  type: string;
  char?: string;
  node?: Node;
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

export interface StaticEnvironment {
  streamEnv: Environment<UID, NameBindingNode>;
  functionEnv: Environment<UID, FunctionInterfaceNode>;
}

export function initStaticEnv(globalFunctions: ReadonlyArray<FunctionDefinitionNode>): StaticEnvironment {
  const globalFunctionEnv: Environment<UID, FunctionInterfaceNode> = new Environment();
  for (const fdef of globalFunctions) {
    globalFunctionEnv.set(fdef.nid, fdef.iface);
  }

  return {
    streamEnv: new Environment(),
    functionEnv: globalFunctionEnv,
  };
}

export function extendStaticEnv(outer: StaticEnvironment, def: FunctionDefinitionNode): StaticEnvironment {
  if (def.impl.kind !== NodeKind.TreeImpl) {
    throw new Error();
  }
  const treeImpl: TreeImplNode = def.impl;

  const streamEnv: Environment<UID, NameBindingNode> = new Environment(outer.streamEnv);
  const functionEnv: Environment<UID, FunctionInterfaceNode> = new Environment(outer.functionEnv);

  def.iface.params.forEach(param => {
    const internalId = treeImpl.pids.get(param.nid);
    if (!internalId) {
      throw new Error();
    }
    if (param.kind === NodeKind.StreamParam) {
      if (streamEnv.has(internalId)) {
        throw new Error();
      }
      streamEnv.set(internalId, param.bind);
    } else if (param.kind === NodeKind.FunctionParam) {
      if (functionEnv.has(internalId)) {
        throw new Error();
      }
      functionEnv.set(internalId, param.iface);
    } else {
      throw new Error();
    }
  });

  const visit = (node: Node): void => {
    if (node.kind === NodeKind.StreamBinding) {
      if (node.bexpr.kind === NodeKind.NameBinding) {
        if (streamEnv.has(node.bexpr.nid)) {
          throw new Error('stream ids must be unique');
        }
        streamEnv.set(node.bexpr.nid, node.bexpr);
      } else {
        throw new Error();
      }
    }

    if (node.kind === NodeKind.FunctionDefinition) {
      if (functionEnv.has(node.nid)) {
        throw new Error('function ids must be unique');
      }
      functionEnv.set(node.nid, node.iface);
    } else {
      visitChildren(node, visit, undefined);
    }
  };

  visitChildren(def, visit, undefined);

  return {
    streamEnv,
    functionEnv,
  };
}

// compute a map from every node to its static env
export function getStaticEnvMap(root: Node, outerEnv: StaticEnvironment): Map<Node, StaticEnvironment> {
  const nodeToEnv: Map<Node, StaticEnvironment> = new Map();

  interface Context {
    env: StaticEnvironment;
    parent: Node | null;
  }

  const visit = (node: Node, ctx: Context): void => {
    nodeToEnv.set(node, ctx.env);

    let newEnv: StaticEnvironment;
    if (node.kind === NodeKind.TreeImpl) {
      const parent = ctx.parent;
      if (!parent || (parent.kind !== NodeKind.FunctionDefinition)) {
        throw new Error();
      }
      newEnv = extendStaticEnv(ctx.env, parent);
    } else {
      newEnv = ctx.env;
    }

    visitChildren(node, visit, {env: newEnv, parent: node});
  };

  visit(root, {env: outerEnv, parent: null});

  return nodeToEnv;
}

export function getReferentNode(node: Node, staticEnvMap: Map<Node, StaticEnvironment>): Node | undefined {
  if (node.kind === NodeKind.StreamReference) {
    const env = staticEnvMap.get(node);
    if (!env) {
      throw new Error();
    }
    const nameBinding = env.streamEnv.get(node.ref);
    if (!nameBinding) {
      throw new Error();
    }
    return nameBinding;
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
    if ((parent.kind === NodeKind.Application) || (parent.kind === NodeKind.StreamBinding)) {
      const newNode: UndefinedLiteralNode = {
        kind: NodeKind.UndefinedLiteral,
        nid: genuid(),
      };
      const newRoot = replaceNode(node, newNode, parentLookup);
      if (newRoot.kind !== NodeKind.FunctionDefinition) {
        throw new Error();
      }
      return {
        mainDef: newRoot,
        selectedNode: newNode,
      };
    } else if (parent.kind === NodeKind.TreeImpl) {
      const [newNodes, newSibSel] = deleteFromArr(node, parent.body);
      const newParent: TreeImplNode = {
        ...parent,
        body: newNodes,
      };
      const newRoot = replaceNode(parent, newParent, parentLookup);
      if (newRoot.kind !== NodeKind.FunctionDefinition) {
        throw new Error();
      }
      return {
        mainDef: newRoot,
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
  return isStreamExpressionNode(node) || (node.kind === NodeKind.Text);
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
  const parentLookup = computeParentLookup(state.stableSelTree.mainDef); // TODO: memoize

  let n: Node = state.stableSelTree.selectedNode;
  while (true) {
    const parent = parentLookup.get(n);
    if (!parent) {
      return state;
    }

    if (parent.kind === NodeKind.TreeImpl) {
      const idx = parent.body.indexOf(n as TreeImplBodyNode);
      const newElem: UndefinedLiteralNode = {
        kind: NodeKind.UndefinedLiteral,
        nid: genuid(),
      };
      const newTreeImpl: TreeImplNode = {
        ...parent,
        body: arrInsertBeforeAfter(parent.body, idx, before, newElem),
      };
      const newMain = replaceNode(parent, newTreeImpl, parentLookup);
      if (newMain.kind !== NodeKind.FunctionDefinition) {
        throw new Error();
      }
      const initSelTree: SelTree = {
        mainDef: newMain,
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

function fixupDanglingRefs(selTree: SelTree, globalFunctions: ReadonlyArray<FunctionDefinitionNode>): SelTree {
  const globalEnv = initStaticEnv(globalFunctions);

  const oldNodeToNew: Map<Node, Node> = new Map();

  const transform = (node: Node, env: StaticEnvironment): Node => {
    let newNode: Node = node;
    if (node.kind === NodeKind.StreamReference) {
      const streamDef = env.streamEnv.get(node.ref);
      if (!streamDef) {
        newNode = {
          kind: NodeKind.UndefinedLiteral,
          nid: genuid(),
        };
      }
    }

    let newEnv: StaticEnvironment;
    if (node.kind === NodeKind.FunctionDefinition) {
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

  const newMain = transform(selTree.mainDef, globalEnv);
  if (newMain.kind !== NodeKind.FunctionDefinition) {
    throw new Error();
  }

  const newSelectedNode = oldNodeToNew.get(selTree.selectedNode) || selTree.selectedNode;
  // TODO: verify that newSelectedNode is in newMain

  // console.log('fixupDanglingRefs', 'tree changed?', newMain !== selTree.mainDefinition, 'selnode changed?', newSelectedNode !== selTree.selectedNode);

  return {
    mainDef: newMain,
    selectedNode: newSelectedNode,
  };
}

// NOTE: May throw a compiler exception
function compileSelTree(selTree: SelTree, globalFunctions: ReadonlyArray<FunctionDefinitionNode>): CompiledDefinition {
  // NOTE: We could avoid repeating this work, but this is sort of temporary anyways
  const globalFunctionEnvironment: Environment<UID, FunctionDefinitionNode> = new Environment();
  for (const gf of globalFunctions) {
    globalFunctionEnvironment.set(gf.nid, gf);
  }

  return compileGlobalTreeDefinition(selTree.mainDef, globalFunctionEnvironment);
}

function updateExecution(state: State, newCompiledDefinition: CompiledDefinition): State {
  if (state.execution) {
    const { updateCompiledDefinition } = state.execution;

    beginBatch();
    try {
      updateCompiledDefinition(newCompiledDefinition);
    } catch (e) {
      throw e;
    }
    endBatch();

    return state;
  } else {
    // There is no old state, so we need to create the long-lived stuff
    const [liveStreamFunc, updateCompiledDefinition] = createLiveFunction(newCompiledDefinition, nativeFunctionEnvironment);
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
  const fixedSelTree = fixupDanglingRefs(newSelTree, state.globalFunctions);

  let compiledDefinition: CompiledDefinition | undefined;
  try {
    compiledDefinition = compileSelTree(fixedSelTree, state.globalFunctions);
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
   ((node.kind === NodeKind.Text) && !node.text);
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
    const editSelTree: SelTree = {
      mainDef: state.stableSelTree.mainDef,
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

  const parentLookup = computeParentLookup(state.stableSelTree.mainDef);

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
    if (parent.kind === NodeKind.TreeImpl) {
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

    return initialStateFromDefinition(action.newProgram.mainDef, action.newProgram.info as ProgramInfo);
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
    const parentLookup = computeParentLookup(state.editing.initSelTree.mainDef); // TODO: memoize
    const newMain = replaceNode(state.editing.initSelTree.selectedNode, action.newNode!, parentLookup);
    if (newMain.kind !== NodeKind.FunctionDefinition) {
      throw new Error();
    }

    const fixedSelTree = fixupDanglingRefs({mainDef: newMain, selectedNode: action.newNode!}, state.globalFunctions);

    // Check if tentative tree compiles
    let compileError: string | undefined;
    try {
      compileSelTree(fixedSelTree, state.globalFunctions);
      compileError = undefined;
    } catch (e) {
      if (e instanceof CompilationError) {
        compileError = 'compile error: ' + e.message;
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
  } else if (action.type === 'UPDATE_NODE') {
    if (state.editing) {
      throw new Error();
    }
    const parentLookup = computeParentLookup(state.stableSelTree.mainDef); // TODO: memoize
    const newMain = replaceNode(action.node!, action.newNode!, parentLookup);
    if (newMain.kind !== NodeKind.FunctionDefinition) {
      throw new Error();
    }

    const fixedSelTree = fixupDanglingRefs({mainDef: newMain, selectedNode: action.newNode!}, state.globalFunctions);

    const compiledDefinition = compileSelTree(fixedSelTree, state.globalFunctions);

    return updateExecution({
      ...state,
      stableSelTree: fixedSelTree,
    }, compiledDefinition);
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

  const parentLookup = computeParentLookup(state.stableSelTree.mainDef); // TODO: memoize
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

const nativeFunctionEnvironment: Environment<UID, Function> = new Environment();
globalNativeFunctions.forEach(def => {
  if (def.impl.kind !== NodeKind.NativeImpl) {
    throw new Error();
  }
  nativeFunctionEnvironment.set(def.nid, def.impl.impl);
});
nativeFunctionEnvironment.set('$copy', (x: any) => x);

function initialStateFromDefinition(mainDef: FunctionDefinitionNode, programInfo: ProgramInfo): State {
  const initSelTree: SelTree = {mainDef, selectedNode: mainDef};

  const compiledDefinition = compileSelTree(initSelTree, globalNativeFunctions);

  return updateExecution({
    programInfo,
    stableSelTree: initSelTree,
    editing: null,
    globalFunctions: globalNativeFunctions,
    undoStack: [],
    clipboardStack: [],
    execution: null,
  }, compiledDefinition);
}

const INITIAL_MAIN: FunctionDefinitionNode = {
  kind: NodeKind.FunctionDefinition,
  nid: genuid(),
  iface: {
    kind: NodeKind.FunctionInterface,
    nid: genuid(),
    name: {
      kind: NodeKind.Text,
      nid: genuid(),
      text: 'main',
    },
    params: [],
    output: false,
  },
  impl: {
    kind: NodeKind.TreeImpl,
    nid: genuid(),
    pids: new Map(),
    body: [
      {
        kind: NodeKind.NumberLiteral,
        nid: genuid(),
        val: 123,
      },
    ],
    out: null,
  },
    /*
  bodyExprs: [
    {
      kind: NodeKind.Application,
      aid: generateApplicationId(),
      fid: 'bind',
      args: new Map([
        [generateStreamId(), {
          kind: NodeKind.ApplicationOut,
          sid: mdId,
          name: {kind: NodeKind.Name, text: 'md'},
        }],
        [generateStreamId(), {
          kind: NodeKind.Application,
          aid: generateApplicationId(),
          fid: 'mouseDown',
          args: new Map(),
          rid: generateStreamId(),
        }],
      ]),
      rid: undefined,
    },
    {
      kind: NodeKind.Application,
      aid: generateApplicationId(),
      fid: 'showString',
      args: new Map([
        [generateStreamId(), {
          kind: NodeKind.Application,
          aid: generateApplicationId(),
          fid: 'ifte',
          args: new Map([
            [generateStreamId(), {
              kind: NodeKind.StreamReference,
              ref: mdId,
            }],
            [generateStreamId(), {
              kind: NodeKind.Application,
              aid: generateApplicationId(),
              fid: 'cos',
              args: new Map([
                [generateStreamId(), {
                  kind: NodeKind.NumberLiteral,
                  sid: generateStreamId(),
                  val: 10,
                }],
              ]),
              rid: generateStreamId(),
            }],
            [generateStreamId(), {
              kind: NodeKind.NumberLiteral,
              sid: generateStreamId(),
              val: 20,
            }],
          ]),
          rid: generateStreamId(),
        }],
      ]),
      rid: undefined,
    },
  ],
  */
};

export const initialState: State = initialStateFromDefinition(INITIAL_MAIN, {id: genuid(), name: 'my program'});
