import genuid from './uid';
import { State, ProgramInfo, SelTree } from './State';
import { StreamID, FunctionID, generateStreamId, generateFunctionId, NodeKind, Node, TreeFunctionDefinitionNode, FunctionDefinitionNode, isFunctionDefinitionNode, StreamExpressionNode, NativeFunctionDefinitionNode, isStreamExpressionNode, UndefinedLiteralNode, NameNode, BodyExpressionNode } from './Tree';
import { CompiledDefinition } from './CompiledDefinition';
import { compileGlobalTreeDefinition, CompilationError } from './Compiler';
// import { createNullaryVoidRootExecutionContext, beginBatch, endBatch } from 'riv-runtime';
// import { createLiveFunction } from './LiveFunction';
import Environment from './Environment';
import { iterChildren, visitChildren, replaceChild, deleteArrayElementChild, transformChildren } from './Traversal';
import globalNativeFunctions from './globalNatives';

// We don't make a discriminated union of specific actions, but maybe we could
interface Action {
  type: string;
  char?: string;
  newNode?: Node;
  newName?: string;
  programInfo?: ProgramInfo;
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
  expr: StreamExpressionNode;
  name?: string;
}

interface ParamStreamDefinition {
  kind: 'param';
  sid: StreamID;
  name?: string;
}

export type StreamDefinition = ExprStreamDefinition | ParamStreamDefinition;

export interface EnvironmentLookups {
  nodeToNearestTreeDef: Map<Node, TreeFunctionDefinitionNode>;
  treeDefToStreamEnv: Map<TreeFunctionDefinitionNode, Environment<StreamID, StreamDefinition>>;
  treeDefToFunctionEnv: Map<TreeFunctionDefinitionNode, Environment<FunctionID, FunctionDefinitionNode>>;
}

export function computeEnvironmentLookups(mainDefinition: TreeFunctionDefinitionNode, nativeFunctions: ReadonlyArray<NativeFunctionDefinitionNode>): EnvironmentLookups {
  const nodeToNearestTreeDef: Map<Node, TreeFunctionDefinitionNode> = new Map();
  const treeDefToStreamEnv: Map<TreeFunctionDefinitionNode, Environment<StreamID, StreamDefinition>> = new Map();
  const treeDefToFunctionEnv: Map<TreeFunctionDefinitionNode, Environment<FunctionID, FunctionDefinitionNode>> = new Map();

  const visitTreeDef = (def: TreeFunctionDefinitionNode, outerStreamEnv: Environment<StreamID, StreamDefinition> | undefined, outerFunctionEnv: Environment<FunctionID, FunctionDefinitionNode> | undefined): void => {
    const streamEnv: Environment<StreamID, StreamDefinition> = new Environment(outerStreamEnv);
    const functionEnv: Environment<FunctionID, FunctionDefinitionNode> = new Environment(outerFunctionEnv);

    treeDefToStreamEnv.set(def, streamEnv);
    treeDefToFunctionEnv.set(def, functionEnv);

    def.sig.streamParams.forEach((sparam, idx) => {
      const sid = def.spids[idx];
      if (streamEnv.has(sid)) {
        throw new Error();
      }
      streamEnv.set(sid, {
        kind: 'param',
        sid,
        name: sparam.name && sparam.name.text,
      });
    });

    const visitAny = (node: Node): void => {
      if (node.kind === NodeKind.TreeFunctionDefinition) {
        return visitTreeDef(node, streamEnv, functionEnv);
      }

      nodeToNearestTreeDef.set(node, def);

      if (isStreamExpressionNode(node)) {
        if (node.kind === NodeKind.Application) {
          node.sids.forEach(sid => {
            if (streamEnv.has(sid)) {
              throw new Error();
            }
            streamEnv.set(sid, {
              kind: 'expr',
              sid,
              expr: node,
            });
          });
        } else if ((node.kind === NodeKind.UndefinedLiteral) || (node.kind === NodeKind.NumberLiteral) || (node.kind === NodeKind.ArrayLiteral) || (node.kind === NodeKind.StreamIndirection)) {
          if (streamEnv.has(node.sid)) {
            throw new Error();
          }
          streamEnv.set(node.sid, {
            kind: 'expr',
            sid: node.sid,
            expr: node,
            name: ('name' in node) ? node.name : undefined,
          });
        }
      }
      if (isFunctionDefinitionNode(node)) {
        if (functionEnv.has(node.fid)) {
          throw new Error('function ids must be unique');
        }
        functionEnv.set(node.fid, node);
      }
      visitChildren(node, visitAny);
    };

    visitChildren(def.body, visitAny);
  };

  const nativeFuncEnv: Environment<FunctionID, FunctionDefinitionNode> = new Environment();
  for (const extFunc of nativeFunctions) {
    nativeFuncEnv.set(extFunc.fid, extFunc);
  }

  visitTreeDef(mainDefinition, undefined, nativeFuncEnv);

  return {
    nodeToNearestTreeDef,
    treeDefToStreamEnv,
    treeDefToFunctionEnv,
  };
}

function nextArrowSelectableLeft(node: Node, selMoveLookups: SelectionMovementLookups): Node | undefined {
  return selMoveLookups.rootward.get(node);
}

function nextArrowSelectableRight(node: Node, selMoveLookups: SelectionMovementLookups): Node | undefined {
  return selMoveLookups.leafward.get(node);
}

function nextArrowSelectableUpDown(node: Node, up: boolean, selMoveLookups: SelectionMovementLookups): Node | undefined {
  let n: Node = node;

  while (true) {
    const sib = up ? selMoveLookups.prev.get(n) : selMoveLookups.next.get(n);
    if (sib) {
      return sib;
    }
    const parent = selMoveLookups.rootward.get(n);
    if (!parent) {
      // Made it to root without being able to move up/down
      return undefined;
    }
    n = parent;
  }
}

function handleSelectionAction(action: Action, selectedNode: Node, selMoveLookups: SelectionMovementLookups): Node | void {
  switch (action.type) {
    case 'SET_SELECTED_NODE':
      return action.newNode!;

    case 'MOVE_LEFT':
      return nextArrowSelectableLeft(selectedNode, selMoveLookups);

    case 'MOVE_RIGHT':
      return nextArrowSelectableRight(selectedNode, selMoveLookups);

    case 'MOVE_UP':
      return nextArrowSelectableUpDown(selectedNode, true, selMoveLookups);

    case 'MOVE_DOWN':
      return nextArrowSelectableUpDown(selectedNode, false, selMoveLookups);
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

/**
 * Returns [newRoot, newSelectedNode]
 */
function deleteArrayElementNode(node: Node, parentLookup: Map<Node, Node>, selMoveLookups: SelectionMovementLookups): SelTree {
  const parent = parentLookup.get(node);
  if (!parent) {
    throw new Error();
  }

  const sibling = selMoveLookups.prev.get(node) || selMoveLookups.next.get(node);
  const newParent = deleteArrayElementChild(parent, node);
  const newRoot = replaceNode(parent, newParent, parentLookup);
  const newSelectedNode = sibling; // TODO: fall back on new rootward-selectable
  if (!newSelectedNode) {
    throw new Error('should not be possible?');
  }
  if (newRoot.kind !== NodeKind.TreeFunctionDefinition) {
    throw new Error();
  }
  return {
    mainDefinition: newRoot,
    selectedNode: newSelectedNode,
  };
}

function deleteNodeSubtree(node: Node, parentLookup: Map<Node, Node>, selMoveLookups: SelectionMovementLookups): SelTree | void {
  const parent = parentLookup.get(node);

  if (!parent) {
    return;
  }

  if (isStreamExpressionNode(node)) {
    if ((parent.kind === NodeKind.Application) || (parent.kind === NodeKind.StreamIndirection)) {
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
    } else if ((parent.kind === NodeKind.ArrayLiteral) || (parent.kind === NodeKind.TreeFunctionBody)) {
      return deleteArrayElementNode(node, parentLookup, selMoveLookups);
    } else {
      throw new Error();
    }
  }
}

function handleInstantEditAction(action: Action, selTree: SelTree, parentLookup: Map<Node, Node>, selMoveLookups: SelectionMovementLookups): SelTree | void {
  switch (action.type) {
    case 'DELETE_SUBTREE':
      return deleteNodeSubtree(selTree.selectedNode, parentLookup, selMoveLookups);
  }
}

export function computeParentLookup(root: Node): Map<Node, Node> {
  const parent: Map<Node, Node> = new Map();

  const visit = (node: Node): void => {
    for (const child of iterChildren(node)) {
      parent.set(child, node);
    }

    visitChildren(node, visit);
  };

  visit(root);

  return parent;
}

interface SelectionMovementLookups {
  prev: Map<Node, Node>;
  next: Map<Node, Node>;
  rootward: Map<Node, Node>;
  leafward: Map<Node, Node>;
}

export function computeSelectionMovementLookups(root: Node): SelectionMovementLookups {
  const prev: Map<Node, Node> = new Map();
  const next: Map<Node, Node> = new Map();
  const rootward: Map<Node, Node> = new Map();
  const leafward: Map<Node, Node> = new Map();

  const setForArr = (arr: ReadonlyArray<Node>, parent: Node): void => {
    if (arr.length) {
      leafward.set(parent, arr[0]);
    }

    let p: Node | undefined;
    for (const n of arr) {
      rootward.set(n, parent);
      if (p) {
        prev.set(n, p);
        next.set(p, n);
      }
      p = n;
    }
  };

  const visit = (node: Node): void => {
    switch (node.kind) {
      case NodeKind.ArrayLiteral:
        setForArr(node.elems, node);
        break;

      case NodeKind.StreamIndirection:
        leafward.set(node, node.expr);
        rootward.set(node.expr, node);
        break;

      case NodeKind.Application: {
        setForArr(([] as ReadonlyArray<Node>).concat(node.sargs, node.fargs), node);
        break;
      }

      case NodeKind.TreeFunctionDefinition:
        setForArr(node.body.exprs, node);
        break;

      case NodeKind.YieldExpression:
        leafward.set(node, node.expr);
        rootward.set(node.expr, node);
        break;
    }

    visitChildren(node, visit);
  };

  visit(root);

  return {
    prev,
    next,
    rootward,
    leafward,
  };
}

function attemptBeginEditSelected(state: State): State {
  if (isStreamExpressionNode(state.stableSelTree.selectedNode)) {
    return {
      ...state,
      editingSelTree: state.stableSelTree,
    };
  } else {
    console.log('Not starting edit because not a stream expression');
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
      return {
        ...state,
        editingSelTree: {
          mainDefinition: newMain,
          selectedNode: newElem,
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
      return {
        ...state,
        editingSelTree: {
          mainDefinition: newMain,
          selectedNode: newElem,
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
  const envLookups = computeEnvironmentLookups(selTree.mainDefinition, nativeFunctions);

  const oldNodeToNew: Map<Node, Node> = new Map();

  const transform = (node: Node): Node => {
    let newNode: Node = node;
    if (node.kind === NodeKind.StreamReference) {
      const nearestDef = envLookups.nodeToNearestTreeDef.get(node);
      if (!nearestDef) {
        throw new Error();
      }
      const nodeStreamEnv = envLookups.treeDefToStreamEnv.get(nearestDef);
      if (!nodeStreamEnv) {
        throw new Error();
      }
      const streamDef = nodeStreamEnv.get(node.ref);
      if (!streamDef) {
        newNode = {
          kind: NodeKind.UndefinedLiteral,
          sid: generateStreamId(),
        };
      }

    }

    const newNewNode = transformChildren(newNode, transform);

    if (newNewNode !== node) {
      oldNodeToNew.set(node, newNewNode);
    }

    return newNewNode;
  };

  const newMain = transform(selTree.mainDefinition);
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
function fixupAndCompileTree(selTree: SelTree, nativeFunctions: ReadonlyArray<NativeFunctionDefinitionNode>): [SelTree, CompiledDefinition] {
  const fixedSelTree = fixupDanglingRefs(selTree, nativeFunctions);

  // NOTE: We could avoid repeating this work, but this is sort of temporary anyways
  const globalFunctionEnvironment: Environment<FunctionID, FunctionDefinitionNode> = new Environment();
  for (const nf of nativeFunctions) {
    globalFunctionEnvironment.set(nf.fid, nf);
  }

  let compiledDefinition: CompiledDefinition;
  try {
    compiledDefinition = compileGlobalTreeDefinition(fixedSelTree.mainDefinition, globalFunctionEnvironment);
  } catch (e) {
    if (e instanceof CompilationError) {
      console.log('COMPILATION ERROR', e.message);
      throw e;
    } else {
      throw e;
    }
  }

  console.log('COMPILED DEF', compiledDefinition);

  // TODO: return new tree and compiled definition
  return [fixedSelTree, compiledDefinition];
}

function updateLiveExecution(state: State): State {
  /*
  // We initialize with an "empty" definition, which we fall back on if compilation fails
  let newCompiledDefinition: CompiledDefinition = {
    parameters: [],
    constantStreamValues: [],
    applications: [],
    containedFunctionDefinitions: [],
    yieldStreamId: null,
    externalReferencedStreamIds: new Set(),
    externalReferencedFunctionIds: new Set(),
  };

  try {
    // NOTE: We could avoid repeating this work, but this is sort of temporary anyways
    const globalFunctionEnvironment: Environment<FunctionDefinitionNode> = new Environment();
    for (const nf of newState.nativeFunctions) {
      globalFunctionEnvironment.set(nf.id, nf);
    }

    newCompiledDefinition = compileGlobalUserDefinition(newState.program.mainDefinition, globalFunctionEnvironment);
    // console.log('compiled to', newCompiledDefinition);
  } catch (e) {
    if (e instanceof CompilationError) {
      console.log('COMPILATION ERROR', e.message);
    } else {
      throw e;
    }
  }

  let newLiveMain;

  if (oldState) {
    const { context, updateCompiledDefinition } = oldState.liveMain!;

    // console.log('updating compiled definition to', newCompiledDefinition);
    beginBatch();
    updateCompiledDefinition(newCompiledDefinition);
    endBatch();

    newLiveMain = {
      context,
      updateCompiledDefinition,
      compiledDefinition: newCompiledDefinition,
    };
  } else {
    // There is no old state, so we need to create the long-lived stuff
    // console.log('initializing compiled definition to', newCompiledDefinition);
    const [liveStreamFunc, updateCompiledDefinition] = createLiveFunction(newCompiledDefinition, nativeFunctionEnvironment);
    const context = createNullaryVoidRootExecutionContext(liveStreamFunc);

    context.update(); // first update that generally kicks off further async updates

    newLiveMain = {
      context,
      updateCompiledDefinition,
      compiledDefinition: newCompiledDefinition,
    };
  }

  return {
    ...newState,
    liveMain: newLiveMain,
  };
  */

  return state;
}

// NOTE: may throw a compiler exception
function updateAfterEdit(state: State): State {
  const [newSelTree, compiledDef] = fixupAndCompileTree(state.stableSelTree, state.nativeFunctions);
  return updateLiveExecution({
    ...state,
    stableSelTree: newSelTree,
    // TODO: put in compiledDef
  });
}

export function reducer(state: State, action: Action): State {
  console.log('action', action);

  /*
  if (action.type === 'LOAD_PROGRAM') {
    if (!action.program) {
      throw new Error();
    }

    // Terminate currently running main function
    if (!state.liveMain) {
      throw new Error();
    }
    state.liveMain.context.terminate();

    return initialStateFromProgram(action.program);
  }
  */

  if (action.type === 'BEGIN_EDIT') {
    if (!state.editingSelTree) {
      return attemptBeginEditSelected(state);
    }
  } else if (action.type === 'INSERT_BEFORE') {
    if (!state.editingSelTree) {
      return attemptInsertBeforeAfter(state, true);
    }
  } else if (action.type === 'INSERT_AFTER') {
    if (!state.editingSelTree) {
      return attemptInsertBeforeAfter(state, false);
    }
  } else if (action.type === 'TOGGLE_EDIT') {
    if (state.editingSelTree) {
      return updateAfterEdit({
        ...pushUndo(state),
        stableSelTree: state.editingSelTree,
        editingSelTree: null,
      });
    } else {
      return attemptBeginEditSelected(state);
    }
  } else if (action.type === 'ABORT_EDIT') {
    if (state.editingSelTree) {
      return {
        ...state,
        editingSelTree: null,
      };
    }
  } else if (action.type === 'UPDATE_EDITING_NODE') {
    if (!state.editingSelTree) {
      throw new Error();
    }
    const parentLookup = computeParentLookup(state.editingSelTree.mainDefinition); // TODO: memoize
    const newMain = replaceNode(state.editingSelTree.selectedNode, action.newNode!, parentLookup);
    if (newMain.kind !== NodeKind.TreeFunctionDefinition) {
      throw new Error();
    }
    return {
      ...state,
      editingSelTree: {
        mainDefinition: newMain,
        selectedNode: action.newNode!,
      }
    };
  } else if (action.type === 'UNDO') {
    if (state.undoStack.length > 0) {
      const newSelTree = state.undoStack[state.undoStack.length-1];
      return updateAfterEdit({
        ...state,
        stableSelTree: newSelTree,
        editingSelTree: null,
        undoStack: state.undoStack.slice(0, state.undoStack.length-1),
      });
    } else {
      console.log('nothing to undo');
      return state;
    }
  }

  const selMoveLookups = computeSelectionMovementLookups(state.stableSelTree.mainDefinition); // TODO: memoize
  const handleSelectionActionResult = handleSelectionAction(action, state.stableSelTree.selectedNode, selMoveLookups);
  if (handleSelectionActionResult) {
    const newSelectedNode = handleSelectionActionResult;
    if (newSelectedNode !== state.stableSelTree.selectedNode) {
      return {
        ...state,
        stableSelTree: {
          ...state.stableSelTree,
          selectedNode: newSelectedNode,
        },
        editingSelTree: null, // abort any edits
      };
    } else {
      return state;
    }
  }

  const parentLookup = computeParentLookup(state.stableSelTree.mainDefinition); // TODO: memoize
  const handleEditActionResult = handleInstantEditAction(action, state.stableSelTree, parentLookup, selMoveLookups);
  if (handleEditActionResult) {
    const newSelTree = handleEditActionResult;

    if (newSelTree !== state.stableSelTree) {
      return updateAfterEdit({
        ...pushUndo(state),
        stableSelTree: newSelTree,
      });
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

function initialStateFromDefinition(mainDefinition: TreeFunctionDefinitionNode): State {
  const nativeFunctions: ReadonlyArray<NativeFunctionDefinitionNode> = globalNativeFunctions.map(([fid, desc, signature, ]) => ({
    kind: NodeKind.NativeFunctionDefinition,
    fid,
    name: { kind: NodeKind.Name, text: desc },
    sig: signature,
  }));

  return {
    programInfo: {
      id: genuid(),
      name: 'my program',
    },
    stableSelTree: {
      mainDefinition,
      selectedNode: mainDefinition,
    },
    editingSelTree: null,
    nativeFunctions,
    // liveMain: null,
    undoStack: [],
    clipboardStack: [],
  };
}

const mdId = generateStreamId();
const INITIAL_MAIN: TreeFunctionDefinitionNode = {
  kind: NodeKind.TreeFunctionDefinition,
  fid: generateFunctionId(),
  name: {kind: NodeKind.Name, text: 'main'},
  sig: {
    kind: NodeKind.Signature,
    streamParams: [],
    funcParams: [],
    yields: [],
  },
  spids: [],
  fpids: [],
  body: {
    kind: NodeKind.TreeFunctionBody,
    exprs: [
      {
        kind: NodeKind.StreamIndirection,
        sid: mdId,
        name: 'md',
        expr: {
          kind: NodeKind.Application,
          sids: [generateStreamId()],
          reti: 0,
          func: {
            kind: NodeKind.FunctionReference,
            ref: 'mouseDown',
          },
          sargs: [],
          fargs: [],
        },
      },
      {
        kind: NodeKind.Application,
        sids: [],
        reti: 0,
        func: {
          kind: NodeKind.FunctionReference,
          ref: 'showString',
        },
        sargs: [
          {
            kind: NodeKind.Application,
            sids: [generateStreamId()],
            reti: 0,
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
                sids: [generateStreamId(), generateStreamId(), generateStreamId()],
                reti: 1,
                func: {
                  kind: NodeKind.FunctionReference,
                  ref: 'trig',
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
              /*
              {
                kind: NodeKind.Application,
                dsids: [{sid: generateStreamId(), desc: {kind: NodeKind.Description, text: 'luuux'}}],
                reti: 0,
                func: {
                  kind: NodeKind.FunctionReference,
                  ref: 'mult',
                },
                sargs: [
                  {
                    kind: NodeKind.UndefinedLiteral,
                    sid: generateStreamId(),
                  },
                  {
                    kind: NodeKind.UndefinedLiteral,
                    sid: generateStreamId(),
                  },
                ],
                fargs: [],
              },
              */
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

export const initialState: State = initialStateFromDefinition(INITIAL_MAIN);
