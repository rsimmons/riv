import genuid from '../util/uid';
import { UID, NodeKind, Node, FunctionDefinitionNode, FunctionInterfaceNode, NameBindingNode, TreeImplNode } from '../compiler/Tree';
import { compileGlobalTreeDefinition, CompilationError } from '../compiler/Compiler';
import { createNullaryVoidRootExecutionContext, beginBatch, endBatch } from 'riv-runtime';
import { createLiveFunction } from '../runner/LiveFunction';
import Environment from '../util/Environment';
import { visitChildren, transformChildren } from '../compiler/Traversal';
import globalNativeFunctions from '../builtin/globalNatives';
import { ExecutionContext } from 'riv-runtime';
import { CompiledDefinition } from '../compiler/CompiledDefinition';

export interface ProgramInfo {
  readonly id: string;
  readonly name: string;
}

interface ExecutionState {
  context: ExecutionContext;
  compiledDefinition: CompiledDefinition | null;
  updateCompiledDefinition: (newDefinition: CompiledDefinition) => void;
}

interface State {
  readonly programInfo: ProgramInfo;
  readonly liveMainDef: FunctionDefinitionNode;
  readonly dispMainDef: FunctionDefinitionNode;
  readonly undoStack: ReadonlyArray<FunctionDefinitionNode>;
  readonly execution: ExecutionState | null;
}

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

function extendStaticEnv(outer: StaticEnvironment, def: FunctionDefinitionNode): StaticEnvironment {
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

function pushUndo(state: State): State {
  return {
    ...state,
    undoStack: state.undoStack.concat([state.dispMainDef]),
  };
}

function fixupDanglingRefs(mainDef: FunctionDefinitionNode, globalFunctions: ReadonlyArray<FunctionDefinitionNode>): FunctionDefinitionNode {
  const globalEnv = initStaticEnv(globalFunctions);

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

    return newNewNode;
  };

  const newMain = transform(mainDef, globalEnv);
  if (newMain.kind !== NodeKind.FunctionDefinition) {
    throw new Error();
  }

  // console.log('fixupDanglingRefs', 'tree changed?', newMain !== selTree.mainDefinition, 'selnode changed?', newSelectedNode !== selTree.selectedNode);

  return newMain;
}

// NOTE: May throw a compiler exception
function compileMainDef(mainDef: FunctionDefinitionNode, globalFunctions: ReadonlyArray<FunctionDefinitionNode>): CompiledDefinition {
  // NOTE: We could avoid repeating this work, but this is sort of temporary anyways
  const globalFunctionEnvironment: Environment<UID, FunctionDefinitionNode> = new Environment();
  for (const gf of globalFunctions) {
    globalFunctionEnvironment.set(gf.nid, gf);
  }

  return compileGlobalTreeDefinition(mainDef, globalFunctionEnvironment);
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

function updateTree(state: State, newRoot: FunctionDefinitionNode): State {
  // TODO: put this back?
  // const fixedSelTree = fixupDanglingRefs(newSelTree, state.globalFunctions);

  let compiledDefinition: CompiledDefinition | undefined;
  try {
    compiledDefinition = compileMainDef(newRoot, globalNativeFunctions);
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
      dispMainDef: newRoot,
      liveMainDef: newRoot,
    }, compiledDefinition);
  } else {
    return {
      ...state,
      dispMainDef: newRoot,
    };
  }
}

/*
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
*/

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
  } else if (action.type === 'UPDATE_TREE') {
    const newRoot: Node = action.newNode!;
    if (newRoot.kind !== NodeKind.FunctionDefinition) {
      throw new Error();
    }

    return updateTree({
      ...pushUndo(state),
    }, newRoot);
  } else if (action.type === 'UNDO') {
    if (state.undoStack.length > 0) {
      const newSelTree = state.undoStack[state.undoStack.length-1];
      return updateTree({
        ...state,
        undoStack: state.undoStack.slice(0, state.undoStack.length-1),
      }, newSelTree);
    } else {
      console.log('nothing to undo');
      return state;
    }
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
  const compiledDefinition = compileMainDef(mainDef, globalNativeFunctions);

  return updateExecution({
    programInfo,
    liveMainDef: mainDef,
    dispMainDef: mainDef,
    undoStack: [],
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
      {
        kind: NodeKind.NumberLiteral,
        nid: genuid(),
        val: 456,
      },
    ],
    out: null,
  },
};

export const initialState: State = initialStateFromDefinition(INITIAL_MAIN, {id: genuid(), name: 'my program'});
