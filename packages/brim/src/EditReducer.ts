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

export function nodeFromPath(root: Node, path: Path): Node {
  let cur: any = root;
  for (const seg of path) {
    cur = cur.children[seg];
  }
  return cur;
}

/*
function nodeSplitPath(node: Node, root: Node, path: Path): [Path, Path] {
  let cur: any = root;
  let idx = 0;
  for (const seg of path) {
    if (node === cur) {
      return [path.slice(0, idx), path.slice(idx)];
    }
    cur = cur.children[seg];
    idx++;
  }

  if (node === cur) {
    return [path.slice(0, idx), path.slice(idx)];
  } else {
    throw new Error('node was not in path');
  }
}
*/

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
interface HandlerArgs {
  node: Node,
  subpath: Path,
  editingSelected: NodeEditState,
  action: Action;
}
type HandlerResult = (undefined | [Node, Path, NodeEditState]);
type Handler = [string, string[], (args: HandlerArgs) => HandlerResult];

// TODO: If we want to include other classes in the lists, generate an expansion over the closure
// TODO: Instead of this, we could have handlers provide predicate functions, and use isExpressionNode, etc.
const SCHEMA_CLASSES: {[nodeType: string]: string[]} = {
  Expression: ['UndefinedExpression', 'IntegerLiteral', 'ArrayLiteral', 'StreamReference', 'Application', 'Parameter'],
  Any: ['Program', 'Identifier', 'UndefinedExpression', 'IntegerLiteral', 'ArrayLiteral', 'StreamReference', 'Application', 'NativeFunction', 'UserFunction'],
}

function deleteDefinitionExpression(node: UserFunctionDefinitionNode, removeIdx: number): [UserFunctionDefinitionNode, Path, NodeEditState] {
  // TODO: Handle case where we delete all expressions
  if (typeof(removeIdx) !== 'number') {
    throw new Error();
  }
  const newNode = {
    ...node,
    expressions: [
      ...node.expressions.slice(0, removeIdx),
      ...node.expressions.slice(removeIdx+1),
    ],
  };

  if (newNode.expressions.length) {
    let newIdx = removeIdx-1;
    newIdx = Math.max(newIdx, 0);
    newIdx = Math.min(newIdx, node.expressions.length-1);
    return [newNode, ['expressions', newIdx], null];
  } else {
    // We've deleted all expressions, so make a single empty one.
    const n: Node = {
      type: 'UndefinedExpression',
      streamId: genuid(),
      identifier: null,
    };
    newNode.expressions.push(n);
    return [newNode, ['expressions', 0], {originalNode: n, tentativeNode: n}];
  }
}

function endEdit({node, subpath, editingSelected}: HandlerArgs, confirm: boolean): HandlerResult {
  if (!editingSelected) {
    throw new Error(); // sanity check
  }

  if (isIdentifierNode(node)) {
    // Ignore this so that it gets handled by its parent
    return;
  }

  if (subpath.length !== 0) {
    if (!isExpressionNode(node) || !equiv(subpath, ['identifier'])) {
      throw new Error(); // sanity check
    }

    // Ending an edit on the identifier that is the child of this expression
    if (!node.identifier) {
      throw new Error();
    }

    let newIdName;
    if (confirm) {
      newIdName = node.identifier.name.trim();
    } else {
      newIdName = (editingSelected.originalNode as IdentifierNode).name;
    }

    let newIdNode: IdentifierNode | null = newIdName ? {
      type: 'Identifier',
      name: newIdName,
    } : null;

    return [{
      ...node,
      identifier: newIdNode,
    }, [], null];
  }

  const newNode = confirm ? editingSelected.tentativeNode : editingSelected.originalNode;

  let newSubpath: Path = subpath;
  let newEditingSelected = null;
  if (confirm) {
    const hit = firstUndefinedNode(newNode);
    if (hit) {
      const [hitNode, hitPath] = hit;
      if (hitNode !== newNode) { // need to check this otherwise we can't confirm edit of undefined node
        newSubpath = hitPath;
        newEditingSelected = {originalNode: hitNode, tentativeNode: hitNode};
      }
    }
  }

  return [newNode, newSubpath, newEditingSelected];
}

const HANDLERS: Handler[] = [
  ['Program', ['SET_PROGRAM_NAME'], ({node, subpath, editingSelected, action}) => {
    return [{
      ...node,
      name: action.newName || '',
    }, subpath, editingSelected];
  }],

  ['UserFunction', ['MOVE_UP', 'MOVE_DOWN'], ({node, subpath, action}) => {
    if (!isUserFunctionNode(node)) {
      throw new Error();
    }

    // NOTE: This assumes that selection is on/in one of the expressions
    const newExpressionIdx = () => {
      const idx = subpath[1];
      if (typeof idx !== 'number') {
        throw new Error();
      }
      let newIdx = idx + ((action.type === 'MOVE_UP') ? -1 : 1);
      newIdx = Math.max(newIdx, 0);
      newIdx = Math.min(newIdx, node.expressions.length-1);
      return newIdx;
    }

    if ((subpath.length === 2) && (subpath[0] === 'expressions')) {
      return [node, ['expressions', newExpressionIdx()], null];
    }
  }],

  ['UserFunction', ['DELETE'], ({node, subpath}) => {
    if (!isUserFunctionNode(node)) {
      throw new Error();
    }
    if ((subpath.length === 2) && (subpath[0] === 'expressions')) {
      const removeIdx = subpath[1];
      if (typeof(removeIdx) !== 'number') {
        throw new Error();
      }
      return deleteDefinitionExpression(node, removeIdx);
    }
  }],

  ['UserFunction', ['ZOOM_IN', 'MOVE_RIGHT'], ({node, subpath}) => {
    if (!isUserFunctionNode(node)) {
      throw new Error();
    }
    if (subpath.length === 0) {
      return [node, ['expressions', 0], null];
    }
  }],

  ['Any', ['SET_NODE'], ({action}) => {
    return [action.newNode!, [], null];
  }],

  ['Any', ['TOGGLE_EDIT'], (args) => {
    const {node, subpath, editingSelected} = args;

    if (editingSelected) {
      return endEdit(args, true);
    } else {
      if (subpath.length !== 0) {
        throw new Error();
      }

      switch (node.type) {
        case 'IntegerLiteral':
        case 'UndefinedExpression':
        case 'StreamReference':
        case 'Application':
          return [node, subpath, {originalNode: node, tentativeNode: node}];

        case 'ArrayLiteral':
          // Can't directly edit
          break;

        default:
          throw new Error();
      }
    }
  }],

  ['Any', ['ABORT_EDIT'], (args) => {
    const {editingSelected} = args;

    if (editingSelected) {
      return endEdit(args, false);
    }
  }],

  ['Any', ['CONFIRM_EDIT'], (args) => {
    const {editingSelected} = args;

    if (editingSelected) {
      return endEdit(args, true);
    }
  }],

  ['Expression', ['BEGIN_IDENTIFIER_EDIT'], ({node, subpath}) => {
    if (!isExpressionNode(node)) {
      throw new Error();
    }
    if (equiv(subpath, [])) {
      const idNode = node.identifier || {
        type: 'Identifier',
        name: '',
      };

      return [{
        ...node,
        identifier: idNode,
      }, ['identifier'], {originalNode: idNode, tentativeNode: idNode}];
    }
  }],

  ['Expression', ['BEGIN_OVERWRITE_EDIT'], ({node, subpath}) => {
    if (!isExpressionNode(node)) {
      throw new Error();
    }
    const newNode: Node = {
      type: 'UndefinedExpression',
      streamId: node.streamId,
      identifier: node.identifier,
    };
    return [node, subpath, {originalNode: node, tentativeNode: newNode}];
  }],

  ['Any', ['UPDATE_EDITING_TENTATIVE_NODE'], ({node, subpath, action, editingSelected}) => {
    if (!action.newNode) {
      throw new Error();
    }
    if (!editingSelected) {
      throw new Error();
    }
    if (subpath.length === 0) {
      let newNode: Node;
      if (isIdentifierNode(node)) {
        newNode = REALIZE_TENTATIVE_IDENTIFIER_EDITS ? action.newNode : node;
      } else if (isExpressionNode(node)) {
        newNode = REALIZE_TENTATIVE_EXPRESSION_EDITS ? action.newNode : node;
      } else {
        throw new Error();
      }
      return [newNode, subpath, {...editingSelected, tentativeNode: action.newNode}];
    }
  }],

  ['UserFunction', ['EDIT_AFTER'], ({node, subpath}) => {
    if (!isUserFunctionNode(node)) {
      throw new Error();
    }
    if ((subpath.length >= 2) && (subpath[0] === 'expressions')) {
      const afterIdx = subpath[1];
      if (typeof(afterIdx) !== 'number') {
        throw new Error();
      }
      const insertingExprNode: UndefinedExpressionNode = {
        type: 'UndefinedExpression',
        streamId: genuid(),
        identifier: null,
      };
      const newNode: UserFunctionNode = {
        ...node,
        expressions: [
          ...node.expressions.slice(0, afterIdx+1),
          insertingExprNode,
          ...node.expressions.slice(afterIdx+1),
        ],
      };
      return [newNode, ['expressions', afterIdx+1], {originalNode: insertingExprNode, tentativeNode: insertingExprNode}];
    }
  }],

  // NOTE: We only allow MOVE_LEFT to act as ZOOM_OUT here because we know array is displayed vertically for now
  ['ArrayLiteral', ['ZOOM_OUT', 'MOVE_LEFT'], ({node, subpath}) => {
    if (subpath.length === 2) {
      if ((subpath[0] !== 'items') || (typeof(subpath[1]) !== 'number')) {
        throw Error();
      }
      return [node, [], null];
    }
  }],

  // NOTE: We only allow MOVE_RIGHT to act as ZOOM_IN here because we know it will be in a vertical-list container
  ['ArrayLiteral', ['ZOOM_IN', 'MOVE_RIGHT'], ({node, subpath}) => {
    if (!isArrayLiteralNode(node)) {
      throw new Error();
    }
    if (subpath.length === 0) {
      // We do a special thing here: If the array is empty, we create a single undefined item.
      // This gives us a way to add a new element to an empty array.
      if (node.items.length === 0) {
        const newExprNode: UndefinedExpressionNode = {
          type: 'UndefinedExpression',
          streamId: genuid(),
          identifier: null,
        };
        return [{
          ...node,
          items: [newExprNode],
        }, ['items', 0], {originalNode: newExprNode, tentativeNode: newExprNode}];
      } else {
        return [node, ['items', 0], null];
      }
    }
  }],

  ['ArrayLiteral', ['MOVE_UP', 'MOVE_DOWN'], ({node, subpath, action}) => {
    if (!isArrayLiteralNode(node)) {
      throw new Error();
    }

    if ((subpath.length === 2) && (subpath[0] === 'items')) {
      const idx = subpath[1];
      if (typeof idx !== 'number') {
        throw new Error();
      }
      const newIdx = idx + ((action.type === 'MOVE_UP') ? -1 : 1);

      if ((newIdx < 0) || (newIdx >= node.items.length)) {
        return [node, [], null];
      } else {
        return [node, ['items', newIdx], null];
      }
    }
  }],

  ['ArrayLiteral', ['EDIT_AFTER'], ({node, subpath}) => {
    if (!isArrayLiteralNode(node)) {
      throw new Error();
    }
    if ((subpath.length === 2) && (subpath[0] === 'items')) {
      const afterIdx = subpath[1];
      if (typeof(afterIdx) !== 'number') {
        throw new Error();
      }
      const insertingExprNode: UndefinedExpressionNode = {
        type: 'UndefinedExpression',
        streamId: genuid(),
        identifier: null,
      };
      const newNode: ArrayLiteralNode = {
        ...node,
        items: [
          ...node.items.slice(0, afterIdx+1),
          insertingExprNode,
          ...node.items.slice(afterIdx+1),
        ],
      };
      return [newNode, ['items', afterIdx+1], {originalNode: insertingExprNode, tentativeNode: insertingExprNode}];
    }
  }],

  ['ArrayLiteral', ['DELETE'], ({node, subpath}) => {
    if (!isArrayLiteralNode(node)) {
      throw new Error();
    }
    if (subpath.length === 2) {
      if (node.items.length === 0) {
        throw new Error();
      }

      const removeIdx = subpath[1];
      if (typeof(removeIdx) !== 'number') {
        throw new Error();
      }
      const newNode = {
        ...node,
        items: [
          ...node.items.slice(0, removeIdx),
          ...node.items.slice(removeIdx+1),
        ],
      };

      if (newNode.items.length > 0) {
        let newIdx = removeIdx-1;
        newIdx = Math.max(newIdx, 0);
        newIdx = Math.min(newIdx, node.items.length-1);
        return [newNode, ['items', newIdx], null];
      } else {
        return [newNode, [], null];
      }
    }
  }],

  ['Expression', ['CREATE_ARRAY'], ({node, subpath}) => {
    if (!isExpressionNode(node)) {
      throw new Error();
    }

    if (subpath.length === 0) {
      const newExprNode: UndefinedExpressionNode = {
        type: 'UndefinedExpression',
        streamId: genuid(),
        identifier: null,
      };
    return [{
        type: 'ArrayLiteral',
        streamId: node.streamId,
        identifier: node.identifier,
        items: [newExprNode],
      }, ['items', 0], {originalNode: newExprNode, tentativeNode: newExprNode}];
    }
  }],

  // NOTE: We only allow MOVE_LEFT to act as ZOOM_OUT here because we know arguments are displayed vertically for now
  ['UserFunction', ['ZOOM_OUT', 'MOVE_LEFT'], ({node, subpath}) => {
    if (!isUserFunctionNode(node)) {
      throw new Error();
    }
    if (subpath.length === 2) {
      if ((subpath[0] === 'expressions') && (typeof(subpath[1]) === 'number')) {
        return [node, [], null];
      } else {
        throw new Error();
      }
    }
  }],

  // NOTE: We only allow MOVE_LEFT to act as ZOOM_OUT here because we know arguments are displayed vertically for now
  ['Application', ['ZOOM_OUT', 'MOVE_LEFT'], ({node, subpath}) => {
    if (!isApplicationNode(node)) {
      throw new Error();
    }
    if (subpath.length === 2) {
      if ((subpath[0] === 'arguments') && (typeof(subpath[1]) === 'number')) {
        return [node, [], null];
      } else if ((subpath[0] === 'functionArguments') && (typeof(subpath[1]) === 'number')) {
        return [node, [], null];
      } else {
        throw new Error();
      }
    }
  }],

  // NOTE: We only allow MOVE_RIGHT to act as ZOOM_IN here because we know arguments are displayed vertically for now
  ['Application', ['ZOOM_IN', 'MOVE_RIGHT'], ({node, subpath}) => {
    if (!isApplicationNode(node)) {
      throw new Error();
    }
    if (subpath.length === 0) {
      if (node.arguments.length > 0) {
        return [node, ['arguments', 0], null];
      } else if (node.functionArguments.length > 0) {
        return [node, ['functionArguments', 0], null];
      }
    }
  }],

  ['Application', ['MOVE_UP', 'MOVE_DOWN'], ({node, subpath, action}) => {
    if (!isApplicationNode(node)) {
      throw new Error();
    }

    if ((subpath.length === 2) && (subpath[0] === 'arguments')) {
      const idx = subpath[1];
      if (typeof idx !== 'number') {
        throw new Error();
      }
      const newIdx = idx + ((action.type === 'MOVE_UP') ? -1 : 1);

      if ((newIdx >= node.arguments.length) && node.functionArguments.length) {
        return [node, ['functionArguments', 0], null];
      } else if ((newIdx < 0) || (newIdx >= node.arguments.length)) {
        return [node, [], null];
      } else {
        return [node, ['arguments', newIdx], null];
      }
    } else if ((subpath.length === 2) && (subpath[0] === 'functionArguments')) {
      const idx = subpath[1];
      if (typeof idx !== 'number') {
        throw new Error();
      }
      const newIdx = idx + ((action.type === 'MOVE_UP') ? -1 : 1);

      if ((newIdx < 0) && node.arguments.length) {
        return [node, ['arguments', node.arguments.length-1], null];
      } else if ((newIdx < 0) || (newIdx >= node.arguments.length)) {
        return [node, [], null];
      } else {
        return [node, ['functionArguments', newIdx], null];
      }
    }
  }],

  ['Application', ['DELETE'], ({node, subpath, action}) => {
    if (!isApplicationNode(node)) {
      throw new Error();
    }

    if ((subpath.length === 2) && (subpath[0] === 'arguments')) {
      const idx = subpath[1];
      if (typeof idx !== 'number') {
        throw new Error();
      }

      const newArguments = node.arguments.slice();
      newArguments[idx] = {
        type: 'UndefinedExpression',
        streamId: node.arguments[idx].streamId,
        identifier: node.arguments[idx].identifier,
      };

      return [{
        ...node,
        arguments: newArguments,
      }, ['arguments', idx], null];
    }
  }],
];

function applyActionToProgram(program: ProgramNode, selectionPath: Path, editingSelected: NodeEditState, action: Action): [ProgramNode, Path, NodeEditState] {
  let handled = false;
  let newSelectionPath: Path = selectionPath;
  let newEditingSelected: NodeEditState = editingSelected;

  let newProgram = traverseTree(program, {alongPath: selectionPath}, (node, path) => {
    for (const [nt, acts, hfunc] of HANDLERS) {
      const matchingTypes = SCHEMA_CLASSES[nt] ? SCHEMA_CLASSES[nt] : [nt];
      if (matchingTypes.includes(node.type) && acts.includes(action.type)) {
        const [pathBefore, pathAfter] = nodeSplitPath(node, program, selectionPath);
        const handlerResult = hfunc({
          node,
          subpath: pathAfter,
          editingSelected,
          action,
        });
        if (handlerResult) {
          // console.log('action handled, with result', handlerResult);
          handled = true;
          const [handlerNewNode, handlerNewSubpath, handlerNewEditingSelected] = handlerResult;

          newSelectionPath = pathBefore.concat(handlerNewSubpath);
          newEditingSelected = handlerNewEditingSelected;
          return [true, handlerNewNode];
        }
      }
    }

    return [false, node];
  });

  if (newProgram.type !== 'Program') {
    throw new Error(); // sanity check
  }

  if (!handled && ((newProgram !== program) || (newSelectionPath !== selectionPath) || (newEditingSelected !== editingSelected))) {
    throw new Error(); // sanity check
  }

  return [newProgram, newSelectionPath, newEditingSelected];
}

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

/*
const nativeFunctionEnvironment: Environment<Function> = new Environment();
nativeFunctionEnvironment.set('id', (x: any) => x);
nativeFunctionEnvironment.set('Array_of', Array.of);
globalNativeFunctions.forEach(([id, , , jsFunc]) => {
  nativeFunctionEnvironment.set(id, jsFunc);
});
*/

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
