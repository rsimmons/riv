import genuid from './uid';
import { StreamID, FunctionID, generateStreamId, generateFunctionId } from './Identifier';
import { State, Path, NodeEditState, pathIsPrefix, Program } from './State';
import { Node, FunctionDefinitionNode, isFunctionDefinitionNode, isRivFunctionDefinitionNode, isStreamExpressionNode, isStreamReferenceNode, StreamDefinitionNode, StreamExpressionNode, isApplicationNode } from './Tree';
import { EssentialDefinition } from './EssentialDefinition';
import { createNullaryVoidRootExecutionContext, beginBatch, endBatch } from 'riv-runtime';
import { createLiveFunction } from './LiveFunction';
import Environment from './Environment';
import { traverseTree } from './Traversal';
import globalNativeFunctions from './globalNatives';
import { RivFunctionDefinition, NativeFunctionDefinition } from './newEssentialDefinition';
import { treeFromEssential } from './newTreeFromEssential';
import { batchEditRivDefinition, EditBatchItem } from './EditEssentialDefinition';

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
 * "Try" because if the node is not OK to delete, we just return program unchanged.
 */
function tryDeleteSubtree(node: Node, definition: RivFunctionDefinition): RivFunctionDefinition {
  if (node.parent === null) {
    // Can't delete root
    return definition;
  }

  if (isRivFunctionDefinitionNode(node) && node.parent && isApplicationNode(node.parent)) {
    // Can't delete a function-argument, tho I think we could allow this and it would get recreated empty
    return definition;
  }

  // Build edit batch
  const edits: Array<EditBatchItem> = [];

  if (node.type === 'StreamReference') {
    if (!node.parent || (node.childIdx === null)) {
      throw new Error();
    }

    switch (node.parent.type) {
      case 'Application':
        edits.push({
          type: 'undefine_app_stream_argument',
          streamId: node.parent.definition.id,
          argumentIdx: node.childIdx,
        });
        break;

      case 'SimpleStreamDefinition':
        if (node.parent.definition.type !== 'arr') {
          throw new Error();
        }
        edits.push({
          type: 'delete_array_item',
          streamId: node.parent.definition.id,
          itemIdx: node.childIdx,
        });
        break;

      default:
        // TODO: could this be a yielded reference?
        throw new Error();
    }
  } else {
    const recursiveBuildEdits = (n: Node): void => {
      for (const child of n.children) {
        recursiveBuildEdits(child);
      }

      switch (n.type) {
        case 'SimpleStreamDefinition':
        case 'Application':
          edits.push({
            type: 'delete_stream',
            streamId: n.definition.id,
          });
          break;

        case 'StreamReference':
          // nothing to do here
          break;

        default:
          throw new Error();
      }
    };
    recursiveBuildEdits(node);
  }

  // Attempt edit
  const newDefinition = batchEditRivDefinition(definition, {items: edits});

  return newDefinition;
}

/*
function beginEdit(st: CoreState, overwrite: boolean): CoreState | void {
  throw new Error();
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
}

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

interface CoreState {
  readonly mainDefinition: RivFunctionDefinition;
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
];
*/

function handleSelectionAction(action: Action, selectedNode: Node): Node | void {
  switch (action.type) {
    case 'SET_SELECTED_NODE':
      if (action.newSelectedNode!.selectable) {
        return action.newSelectedNode!;
      }
      break;

    case 'MOVE_LEFT':
      return tryMoveSelectionOut(selectedNode);

    case 'MOVE_RIGHT':
      if (isRivFunctionDefinitionNode(selectedNode)) {
        if (selectedNode.children[1].children.length > 0) {
          return selectedNode.children[1].children[0];
        }
      } else if (selectedNode.children.length > 0) {
        return selectedNode.children[0];
      }
      break;

    case 'MOVE_UP':
      return tryMoveSelectionUpDown(selectedNode, true);

    case 'MOVE_DOWN':
      return tryMoveSelectionUpDown(selectedNode, false);
  }
}

function handleDefinitionEditAction(action: Action, mainDefinition: RivFunctionDefinition, selectedNode: Node): RivFunctionDefinition | void {
  switch (action.type) {
    case 'DELETE_SUBTREE':
      return tryDeleteSubtree(selectedNode, mainDefinition);
  }
}

export function reducer(state: State, action: Action): State {
  console.log('action', action);

  if (action.type === 'LOAD_PROGRAM') {
    if (!action.program) {
      throw new Error();
    }

    // Terminate currently running main function
    // TODO: bring back
    /*
    if (!state.liveMain) {
      throw new Error();
    }
    state.liveMain.context.terminate();
    */

    return initializeStateFromProgram(action.program);
  } else if (action.type === 'SET_PROGRAM_NAME') {
    return {
      ...state,
      program: {
        ...state.program,
        name: action.newName || '',
      }
    }
  }

  const newSelectedNode = handleSelectionAction(action, state.selectedNode);
  if (newSelectedNode && (newSelectedNode !== state.selectedNode)) {
    return {
      ...state,
      selectedNode: newSelectedNode,
    };
  }

  const newMainDefinition = handleDefinitionEditAction(action, state.program.mainDefinition, state.selectedNode);
  if (newMainDefinition && (newMainDefinition !== state.program.mainDefinition)) {
    // TODO: find new selectedNode, update liveMain, build new state, etc.
    console.log('newMainDefinition', newMainDefinition);

    const [newTree, newSelectedNode] = treeFromEssential(newMainDefinition, nativeFunctionFromId, state.selectedNode.selectionIds);

    /*
    if (!state.liveMain) {
      throw new Error();
    }
    const { context, updateCompiledDefinition } = state.liveMain!;

    // console.log('updating compiled definition to', newMainDefinition);
    beginBatch();
    updateCompiledDefinition(newMainDefinition);
    endBatch();

    const newLiveMain = {
      context,
      updateCompiledDefinition,
    };
    */

    return {
      ...state,
      program: {
        ...state.program,
        mainDefinition: newMainDefinition,
      },
      tree: newTree,
      selectedNode: newSelectedNode,
    };
  }

  /*
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
    const selectedNode = nodeFromPath(newProgram, newSelectionPath);
    if (isExpressionNode(selectedNode)) {
      newClipboardStack = newClipboardStack.concat([{
        mode: 'cut',
        streamId: selectedNode.streamId,
      }]);
      [newProgram, newSelectionPath] = cutExpressionNode(newProgram, newSelectionPath);
    }
  } else if (action.type === 'PASTE') {
    const selectedNode = nodeFromPath(newProgram, newSelectionPath);
    if ((newClipboardStack.length > 0) && isExpressionNode(selectedNode)) {
      const topFrame = newClipboardStack[newClipboardStack.length-1];
      newClipboardStack = newClipboardStack.slice(0, newClipboardStack.length-1);
      const topNode = state.derivedLookups.streamIdToNode!.get(topFrame.streamId)!;
      [newProgram, newSelectionPath] = pasteExpressionNode(topNode, topFrame.streamId, newProgram, newSelectionPath);
    }
  } else {
    const newCoreState = applyActionToCoreState(action, {
      mainDefinition: newMainDefinition,
      program: newProgram,
      selectedNode: newSelectedNode,
      editingSelected: newEditingSelected,
    });
    newProgram = newCoreState.program;
    newSelectedNode = newCoreState.selectedNode;
    newEditingSelected = newCoreState.editingSelected;
    [newProgram, newSelectionPath, newEditingSelected] = applyActionToProgram(newProgram, newSelectionPath, newEditingSelected, action);
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

    return state;
  }
  */

  console.log('action not handled');
  return state;
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

function initializeStateFromProgram(program: Program): State {
  const selectionIds = [program.mainDefinition.id];
  const [tree, selectedNode] = treeFromEssential(program.mainDefinition, nativeFunctionFromId, selectionIds);

  /*
  const [liveStreamFunc, updateCompiledDefinition] = createLiveFunction(program.mainDefinition, nativeFunctionEnvironment);
  const context = createNullaryVoidRootExecutionContext(liveStreamFunc);
  context.update(); // first update that generally kicks off further async updates

  const liveMain = {
    context,
    updateCompiledDefinition,
  };
  */

  return {
    program,
    tree,
    selectedNode,
    editingSelected: null,
    liveMain: null, // TODO: initialize this
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

export const initialState: State = initializeStateFromProgram({
    programId: genuid(),
    name: 'my program',
    mainDefinition: SAMPLE_DEFINITION,
});
