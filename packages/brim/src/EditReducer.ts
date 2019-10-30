import genuid from './uid';
import { StreamID, FunctionID, generateStreamId, generateFunctionId } from './Identifier';
import { State, Path, NodeEditState, pathIsPrefix, Program } from './State';
import { Node, FunctionDefinitionNode, isFunctionDefinitionNode, isRivFunctionDefinitionNode, isStreamExpressionNode, isStreamReferenceNode, StreamDefinitionNode, StreamExpressionNode } from './Tree';
import { EssentialDefinition } from './EssentialDefinition';
import { createNullaryVoidRootExecutionContext, beginBatch, endBatch } from 'riv-runtime';
import { createLiveFunction } from './LiveFunction';
import Environment from './Environment';
import { traverseTree } from './Traversal';
import globalNativeFunctions from './globalNatives';
import { RivFunctionDefinition, NativeFunctionDefinition } from './newEssentialDefinition';
import { treeFromEssential } from './newTreeFromEssential';

const REALIZE_TENTATIVE_EXPRESSION_EDITS = false;
// const REALIZE_TENTATIVE_IDENTIFIER_EDITS = true;

// We don't make a discriminated union of specific actions, but maybe we could
interface Action {
  type: string;
  char?: string;
  newNode?: Node;
  newSelectedNode?: Node;
  newName?: string;
  program?: Program;
}

/*
function addUserFunctionLocalEnvironment(func: UserFunctionDefinitionNode, namedStreams: Array<[string, StreamCreationNode]>, namedFunctions: Array<[string, FunctionDefinitionNode]>) {
  traverseTree(func, {onlyWithinFunctionId: func.id}, (node, path) => {
    if (isNamedNode(node)) {
      if (isStreamCreationNode(node) && node.name) {
        namedStreams.push([node.name, node]);
      } else if (isFunctionDefinitionNode(node) && node.name) {
        namedFunctions.push([node.name, node]);
      } else {
        throw new Error();
      }
    }
    return [false, node];
  });
}

function addEnvironmentAlongPath(root: Node, path: Path, namedStreams: Array<[string, StreamCreationNode]>, namedFunctions: Array<[string, FunctionDefinitionNode]>) {
  let cur: Node = root;
  for (const seg of path) {
    if (cur.type === 'UserFunctionDefinition') {
      addUserFunctionLocalEnvironment(cur, namedStreams, namedFunctions);
    }
    cur = cur.children[seg];
  }
}
*/

export function environmentForSelectedNode(state: State) {
  const namedStreams: Array<[string, StreamDefinitionNode]> = [];
  const namedFunctions: Array<[string, FunctionDefinitionNode]> = [];

  /*
  for (const extFunc of state.nativeFunctions) {
    if (extFunc.name) {
      namedFunctions.push([extFunc.name, extFunc]);
    }
  }

  addEnvironmentAlongPath(state.program, state.selectionPath, namedStreams, namedFunctions);
  */

  return {
    namedStreams,
    namedFunctions,
  }
}

const equiv = (a: any, b: any): boolean => JSON.stringify(a) === JSON.stringify(b);

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
*/

function firstUndefinedNode(node: Node, after: Path | undefined = undefined): [Node, Path] | undefined {
  let passed = false; // have we passed the "after" path?
  let result: [Node, Path] | undefined;

  traverseTree(node, {}, (node, path) => {
    if (after && pathIsPrefix(after, path)) {
      passed = true;
    }

    if ((node.type === 'SimpleStreamDefinition') && (node.definition.type === 'und')) {
      if (passed || !after) {
        result = [node, path];
        return [true, node];
      }
    }
    return [false, node];
  });

  return result;
}

function tryMoveSelectionOut(node: Node): Node {
  let n: Node = node;

  while (n.parent) {
    n = n.parent;
    if (n.selectable) {
      return n;
    }
  }

  return node;
}

function tryMoveSelectionUpDown(node: Node, up: boolean): Node {
  let n: Node | null = node;
  let depth = 0;

  while (n) {
    if ((n.parent !== null) && (n.childIdx !== null) && (up ? (n.childIdx > 0) : (n.childIdx < (n.parent.children.length-1)))) {
      n = n.parent.children[n.childIdx + (up ? -1 : 1)]; // move up/down
      break;
    }
    n = n.parent;
    depth++;
  }

  if (!n) {
    // We got to the top without being able to move up
    return node;
  }

  // Try to move back down to same depth
  let lastSelectable: Node | null = null;
  while (true) {
    if (n.selectable) {
      lastSelectable = n;
    }
    if ((depth > 0) && (n.children.length > 0)) {
      n = up ? n.children[n.children.length-1] : n.children[0];
      depth--;
    } else {
      break;
    }
  }

  if (!lastSelectable) {
    return node;
  }

  return n;
}


/**
 * "Maybe" because if the node is not OK to delete, we just return program unchanged.
 */
function maybeDeleteSubtreeAtPath(program: Program, atPath: Path): [Program, Path] {
  return [program, atPath];
  /*
  let newProgram = program;
  let newPath = atPath;

  if (atPath.length > 0) {
    const node = nodeFromPath(program, atPath);
    const parentNode = nodeFromPath(program, atPath.slice(0, -1));

    if (isStreamExpressionNode(node)) {
      if (isApplicationNode(parentNode) || isStreamIndirectionNode(parentNode)) {
        const id = isStreamReferenceNode(node) ? generateStreamId() : node.id;
        newProgram = replaceNodeAtPath(program, atPath, {
          type: 'UndefinedLiteral',
          id: id,
          children: [],
        });
      } else {
        if (!(isArrayLiteralNode(parentNode) || isUserFunctionDefinitionExpressionsNode(parentNode))) {
          throw new Error();
        }
        const removeIdx = atPath[atPath.length-1];
        const parentPath = atPath.slice(0, -1);
        const newChildren = [
          ...parentNode.children.slice(0, removeIdx),
          ...parentNode.children.slice(removeIdx+1),
        ];
        const newParentNode = {
          ...parentNode,
          children: newChildren,
        } as Node;
        newProgram = replaceNodeAtPath(program, parentPath, newParentNode);
        if (newChildren.length === 0) {
          newPath = tryMoveSelectionOut(newProgram, atPath);
        } else if (removeIdx >= newChildren.length) {
          newPath = parentPath.concat([removeIdx-1]);
        }
      }
    }
  }

  if (!isProgramNode(newProgram)) {
    throw new Error();
  }

  return [newProgram, newPath];
  */
}

function replaceNodeAtPath(program: Program, atPath: Path, newNode: Node): Program {
  const newMainTree = traverseTree(program.mainTree, {alongPath: atPath}, (node, path) => {
    if (equiv(path, atPath)) {
      return [false, newNode];
    } else {
      return [false, node];
    }
  });

  if (!isRivFunctionDefinitionNode(newMainTree)) {
    throw new Error();
  }

  return {
    ...program,
    mainTree: newMainTree,
  };
}

function beginEdit(st: CoreState, overwrite: boolean): CoreState | void {
  throw new Error();
  /*
  if (st.editingSelected) {
    throw new Error(); // sanity check
  }

  const node = nodeFromPath(st.program, st.selectionPath);
  switch (node.type) {
    case 'NumberLiteral':
    case 'UndefinedLiteral':
    case 'StreamReference':
    case 'Application':
    case 'StreamIndirection':
      return {
        ...st,
        editingSelected: {originalNode: node, tentativeNode: node, overwrite},
      };

    case 'ArrayLiteral':
      // Can't directly edit
      break;

    default:
      throw new Error();
  }
  */
}

/*
function endEdit(st: CoreState, confirm: boolean): CoreState {
  if (!st.editingSelected) {
    throw new Error(); // sanity check
  }

  const newNode = confirm ? st.editingSelected.tentativeNode : st.editingSelected.originalNode;

  let newSelectionPath: Path = st.selectionPath;
  let newEditingSelected = null;

  if (confirm) {
    const hit = firstUndefinedNode(newNode);
    if (hit) {
      const [hitNode, hitPath] = hit;
      if (hitNode !== newNode) { // need to check this otherwise we can't confirm edit of undefined node
        newSelectionPath = st.selectionPath.concat(hitPath);
        newEditingSelected = {originalNode: hitNode, tentativeNode: hitNode, overwrite: true};
      }
    }
  }

  return {
    ...st,
    program: replaceNodeAtPath(st.program, st.selectionPath, newNode),
    selectionPath: newSelectionPath,
    editingSelected: newEditingSelected,
  };
}
*/

interface CoreState {
  readonly program: Program;
  readonly selectedNode: Node;
  readonly editingSelected: NodeEditState;
}

interface HandlerArgs {
  action: Action;
  st: CoreState;
}
type Handler = [Array<string>, (args: HandlerArgs) => CoreState | void];

const HANDLERS: Handler[] = [
  [['SET_PROGRAM_NAME'], ({action, st}) => {
    return {
      ...st,
      program: {
        ...st.program,
        name: action.newName || '',
      }
    };
  }],

  [['SET_SELECTED_NODE'], ({action, st}) => {
    if (action.newSelectedNode!.selectable) {
      return {
        ...st,
        selectedNode: action.newSelectedNode!,
      }
    }
  }],

  [['MOVE_LEFT'], ({st}) => {
    return {
      ...st,
      selectedNode: tryMoveSelectionOut(st.selectedNode),
    }
  }],

  [['MOVE_RIGHT'], ({st}) => {
    if (isRivFunctionDefinitionNode(st.selectedNode)) {
      if (st.selectedNode.children[1].children.length > 0) {
        return {
          ...st,
          selectedNode: st.selectedNode.children[1].children[0],
        }
      }
    } else if (st.selectedNode.children.length > 0) {
      return {
        ...st,
        selectedNode: st.selectedNode.children[0],
      }
    }
  }],

  [['MOVE_UP'], ({st}) => {
    return {
      ...st,
      selectedNode: tryMoveSelectionUpDown(st.selectedNode, true),
    };
  }],

  [['MOVE_DOWN'], ({st}) => {
    return {
      ...st,
      selectedNode: tryMoveSelectionUpDown(st.selectedNode, false),
    };
  }],

/*
  [['ABORT_EDIT'], ({st}) => {
    if (st.editingSelected) {
      return endEdit(st, false);
    }
  }],

  [['CONFIRM_EDIT'], ({st}) => {
    if (st.editingSelected) {
      return endEdit(st, true);
    }
  }],

  [['TOGGLE_EDIT'], ({st}) => {
    if (st.editingSelected) {
      return endEdit(st, true);
    } else {
      return beginEdit(st, false);
    }
  }],

  [['BEGIN_OVERWRITE_EDIT'], ({st}) => {
    return beginEdit(st, true);
  }],

  [['UPDATE_EDITING_TENTATIVE_NODE'], ({st, action}) => {
    if (!action.newNode) {
      throw new Error();
    }
    if (!st.editingSelected) {
      throw new Error();
    }

    const node = nodeFromPath(st.program.mainTree, st.selectionPath);
    if (isStreamExpressionNode(node)) {
      let newNode = REALIZE_TENTATIVE_EXPRESSION_EDITS ? action.newNode : node;
      return {
        ...st,
        program: replaceNodeAtPath(st.program, st.selectionPath, newNode),
        editingSelected: {...st.editingSelected, tentativeNode: action.newNode},
      };
    } else {
      throw new Error();
    }
  }],

  [['EDIT_NEXT_UNDEFINED'], ({st}) => {
    let newSt = applyActionToCoreState({type: 'CONFIRM_EDIT'}, st);

    const hit = firstUndefinedNode(newSt.program.mainTree, newSt.selectionPath);
    if (hit) {
      const [hitNode, hitPath] = hit;
      newSt = {
        ...newSt,
        selectionPath: hitPath,
        editingSelected: {originalNode: hitNode, tentativeNode: hitNode, overwrite: false},
      }
    }

    return newSt;
  }],

  [['DELETE_SUBTREE'], ({st}) => {
    const [newProgram, newPath] = maybeDeleteSubtreeAtPath(st.program, st.selectionPath);
    return {
      ...st,
      program: newProgram,
      selectionPath: newPath,
    };
  }],

  [['CREATE_ARRAY'], ({st}) => {
    const node = nodeFromPath(st.program, st.selectionPath);
    if (isStreamExpressionNode(node)) {
      const newNode: ArrayLiteralNode = {
        type: 'ArrayLiteral',
        id: generateStreamId(),
        children: [
          {
            type: 'UndefinedLiteral',
            id: generateStreamId(),
            children: [],
          },
        ],
      };

      return {
        ...st,
        program: replaceNodeAtPath(st.program, st.selectionPath, newNode),
        selectionPath: st.selectionPath.concat([0]),
      };
    }
  }],
*/
];

function applyActionToCoreState(action: Action, coreState: CoreState): CoreState {
  let newCoreState = coreState;

  for (const [acts, hfunc] of HANDLERS) {
    if (acts.includes(action.type)) {
      const hresult = hfunc({
        action,
        st: coreState,
      });
      if (hresult !== undefined) {
        newCoreState = hresult;
      }
    }
  }

  return newCoreState;
}

function addStateCompiled(oldState: State | undefined, newState: State): State {
  return newState;
  /*
  // We initialize with an "empty" definition, which we fall back on if compilation fails
  let newCompiledDefinition: EssentialDefinition = {
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

    newCompiledDefinition = compileGlobalUserDefinition(newState.program.children[0], globalFunctionEnvironment);
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
}

function addDerivedState(oldState: State | undefined, newState: State): State {
  return addStateCompiled(oldState, newState);
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

  let newProgram = state.program;
  let newSelectedNode: Node = state.selectedNode;
  let newEditingSelected = state.editingSelected;
  let newUndoStack = state.undoStack;
  let newClipboardStack = state.clipboardStack;

  if (action.type === 'UNDO') {
    if (state.undoStack.length > 0) {
      const topFrame = newUndoStack[newUndoStack.length-1];
      newProgram = topFrame.program;
      newSelectedNode = topFrame.selectedNode;
      newUndoStack = newUndoStack.slice(0, newUndoStack.length-1);
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
  } else {
    const newCoreState = applyActionToCoreState(action, {
      program: newProgram,
      selectedNode: newSelectedNode,
      editingSelected: newEditingSelected,
    });
    newProgram = newCoreState.program;
    newSelectedNode = newCoreState.selectedNode;
    newEditingSelected = newCoreState.editingSelected;
    /*
    [newProgram, newSelectionPath, newEditingSelected] = applyActionToProgram(newProgram, newSelectionPath, newEditingSelected, action);
    */
  }

  if ((newProgram !== state.program) || (newSelectedNode !== state.selectedNode) || (newEditingSelected !== state.editingSelected) || (newUndoStack !== state.undoStack) || (newClipboardStack !== state.clipboardStack)) {
    console.log('handled! new prog', newProgram, 'new selectedNode is', newSelectedNode, 'newEditingSelected is', newEditingSelected);
    if (newProgram !== state.program) {
      console.log('program changed identity');

      // Push the state of things _before_ this action onto the stack
      if (action.type !== 'UNDO') {
        newUndoStack = newUndoStack.concat([{
          program: state.program,
          selectedNode: state.selectedNode,
        }]);
      }
    }

    return addDerivedState(state, {
      mainDefinition: state.mainDefinition,
      program: newProgram,
      selectedNode: newSelectedNode,
      editingSelected: newEditingSelected,
      liveMain: null,
      undoStack: newUndoStack,
      clipboardStack: newClipboardStack,
    });
  } else {
    console.log('not handled');
    return state;
  }
}

const nativeFunctionFromId: Map<FunctionID, NativeFunctionDefinition> = new Map();
globalNativeFunctions.forEach(([id, name, signature, jsFunc]) => {
  nativeFunctionFromId.set(id, {
    type: 'native',
    id,
    desc: name,
    signature,
    jsFunc,
  });
});

function initialStateFromDefinition(definition: RivFunctionDefinition): State {
  // const selectionIds = [definition.id];
  const selectionIds = ['S-2'];
  const [tree, selectedNode] = treeFromEssential(SAMPLE_DEFINITION, nativeFunctionFromId, selectionIds);

  if (!selectedNode) {
    throw new Error();
  }

  const program: Program = {
    programId: genuid(),
    name: 'my program',
    mainTree: tree,
  };

  return {
    mainDefinition: definition,
    program,
    selectedNode,
    editingSelected: null,
    liveMain: null,
    undoStack: [],
    clipboardStack: [],
  };
}

const SAMPLE_DEFINITION: RivFunctionDefinition = {
  type: 'riv',
  id: 'F-1',
  desc: 'main',
  signature: {
    streamParameters: [],
    functionParameters: [],
    yields: false,
  },
  streamDefinitions: [
    {
      type: 'app',
      id: 'S-1',
      desc: 'md',
      appliedFunctionId: 'mouseDown',
      streamArgumentIds: [],
      functionArgumentIds: [],
    },
    {
      type: 'num',
      id: 'S-2',
      desc: null,
      value: 10,
    },
    {
      type: 'num',
      id: 'S-3',
      desc: null,
      value: 20,
    },
    {
      type: 'app',
      id: 'S-4',
      desc: null,
      appliedFunctionId: 'ifte',
      streamArgumentIds: ['S-1', 'S-2', 'S-3'],
      functionArgumentIds: [],
    },
    {
      type: 'app',
      id: 'S-5',
      desc: null,
      appliedFunctionId: 'showString',
      streamArgumentIds: ['S-4'],
      functionArgumentIds: [],
    },
    {
      type: 'app',
      id: 'S-6',
      desc: null,
      appliedFunctionId: 'showString',
      streamArgumentIds: ['S-1'],
      functionArgumentIds: [],
    },
  ],
  functionDefinitions: [],
  yieldStreamId: null,
};

export const initialState: State = initialStateFromDefinition(SAMPLE_DEFINITION);
