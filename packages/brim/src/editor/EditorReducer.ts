import genuid from '../util/uid';
import { UID, NodeKind, Node, FunctionDefinitionNode } from '../compiler/Tree';
import { compileGlobalTreeDefinition, CompilationError } from '../compiler/Compiler';
import { createNullaryVoidRootExecutionContext, beginBatch, endBatch } from 'riv-runtime';
import { createLiveFunction } from '../runner/LiveFunction';
import Environment from '../util/Environment';
import globalNativeFunctions from '../builtin/globalNatives';
import { ExecutionContext } from 'riv-runtime';
import { CompiledDefinition } from '../compiler/CompiledDefinition';
import { StaticEnvironment } from '../compiler/TreeUtil';
import { codegenRoot } from '../runner/FasterFunction';

export interface ProgramInfo {
  readonly id: string;
  readonly name: string;
}

interface ExecutionState {
  context: ExecutionContext;
  compiledDefinition: CompiledDefinition | null;
  // updateCompiledDefinition: (newDefinition: CompiledDefinition) => void;
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

export function getReferentNode(node: Node, staticEnvMap: Map<Node, StaticEnvironment>): Node | undefined {
  if (node.kind === NodeKind.StreamReference) {
    const env = staticEnvMap.get(node);
    if (!env) {
      throw new Error();
    }
    const referent = env.get(node.ref);
    if (!referent) {
      throw new Error();
    }
    return referent.creator;
  }
}

function pushUndo(state: State): State {
  return {
    ...state,
    undoStack: state.undoStack.concat([state.dispMainDef]),
  };
}

/*
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
*/

// NOTE: May throw a compiler exception
function compileMainDef(mainDef: FunctionDefinitionNode, globalFunctions: ReadonlyArray<FunctionDefinitionNode>): CompiledDefinition {
  // NOTE: We could avoid repeating this work, but this is sort of temporary anyways
  const globalFunctionEnvironment: Environment<UID, FunctionDefinitionNode> = new Environment();
  for (const gf of globalFunctions) {
    globalFunctionEnvironment.set(gf.nid, gf);
  }

  const compiledResult = compileGlobalTreeDefinition(mainDef, globalFunctionEnvironment);

  return compiledResult;
}

function updateExecution(state: State, newCompiledDefinition: CompiledDefinition): State {
  if (state.execution) {
    const { context } = state.execution;
    context.terminate();
  }

  const createMain = codegenRoot(newCompiledDefinition, false);
  const {main} = createMain(nativeFunctionEnvironment);
  const context = createNullaryVoidRootExecutionContext(main);

  context.update(); // first update that generally kicks off further async updates

  return {
    ...state,
    execution: {
      context,
      compiledDefinition: newCompiledDefinition,
    },
  };
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

export function reducer(state: State, action: Action): State {
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
      // nothing to undo
      return state;
    }
  }

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
    output: {kind: NodeKind.Void, nid: genuid()},
  },
  impl: {
    kind: NodeKind.TreeImpl,
    nid: genuid(),
    pids: new Map(),
    body: [],
  },
};

export const initialState: State = initialStateFromDefinition(INITIAL_MAIN, {id: genuid(), name: 'my program'});
