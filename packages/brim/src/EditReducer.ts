import genuid from './uid';
import { State, ProgramInfo, SelTree } from './State';
import { StreamID, FunctionID, generateStreamId, generateFunctionId, NodeKind, Node, TreeFunctionDefinitionNode, FunctionDefinitionNode, isFunctionDefinitionNode, StreamExpressionNode, NativeFunctionDefinitionNode, isStreamExpressionNode, UndefinedLiteralNode, DescriptionNode } from './Tree';
// import { CompiledDefinition } from './CompiledDefinition';
// import { compileGlobalUserDefinition, CompilationError } from './Compiler';
// import { createNullaryVoidRootExecutionContext, beginBatch, endBatch } from 'riv-runtime';
// import { createLiveFunction } from './LiveFunction';
import Environment from './Environment';
import { iterChildren, visitChildren, replaceChild, deleteArrayElementChild } from './Traversal';
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
const equiv = (a: any, b: any): boolean => JSON.stringify(a) === JSON.stringify(b);

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

function deleteDefinitionExpression(node: TreeFunctionDefinitionNode, removeIdx: number): [TreeFunctionDefinitionNode, Path, NodeEditState] {
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

function tryMoveSelectionOut(program: ProgramNode, selectionPath: Path): Path {
  let p = selectionPath;
  while (p.length > 0) {
    p = p.slice(0, -1);
    const node = nodeFromPath(program, p);
    if (isIDedNode(node)) {
      return p;
    }
  }

  return selectionPath;
}
*/

/**
 * "Maybe" because if the node is not OK to delete, we just return program unchanged.
 */
/*
function maybeDeleteSubtreeAtPath(program: ProgramNode, atPath: Path): [ProgramNode, Path] {
  let newProgram = program;
  let newPath = atPath;

  if (atPath.length > 0) {
    const node = nodeFromPath(program, atPath);
    const parentNode = nodeFromPath(program, atPath.slice(0, -1));

    if (isStreamExpressionNode(node)) {
      if (isApplicationNode(parentNode) || isStreamIndirectionNode(parentNode)) {
        newProgram = replaceNodeAtPath(program, atPath, {
          type: 'UndefinedLiteral',
          id: node.id,
          children: [],
        });
      } else {
        if (!(isArrayLiteralNode(parentNode) || isTreeFunctionDefinitionExpressionsNode(parentNode))) {
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
}

function replaceNodeAtPath(program: ProgramNode, atPath: Path, newNode: Node): ProgramNode {
  const newProgram = traverseTree(program, {alongPath: atPath}, (node, path) => {
    if (equiv(path, atPath)) {
      return [false, newNode];
    } else {
      return [false, node];
    }
  });

  if (!isProgramNode(newProgram)) {
    throw new Error();
  }

  return newProgram;
}

function beginEdit(st: CoreState, overwrite: boolean): CoreState | void {
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
  readonly program: ProgramNode;
  readonly selectionPath: Path;
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

  [['SET_PATH'], ({action, st}) => {
    return {
      ...st,
      selectionPath: action.newPath!,
      editingSelected: null,
    };
  }],

  [['MOVE_LEFT'], ({st}) => {
    return {
      ...st,
      selectionPath: tryMoveSelectionOut(st.program, st.selectionPath),
    }
  }],

  [['MOVE_RIGHT'], ({st}) => {
    const node = nodeFromPath(st.program, st.selectionPath);
    if (isTreeFunctionDefinitionNode(node)) {
      if (node.children[1].children.length > 0) {
        return {
          ...st,
          selectionPath: st.selectionPath.concat([1, 0]),
        }
      }
    } else if (node.children.length > 0) {
      return {
        ...st,
        selectionPath: st.selectionPath.concat([0]),
      }
    }
  }],

  [['MOVE_UP'], ({st}) => {
    if (st.selectionPath.length > 0) {
      const lastIdx = st.selectionPath[st.selectionPath.length-1];
      if (lastIdx > 0) {
        return {
          ...st,
          selectionPath: st.selectionPath.slice(0, -1).concat([lastIdx-1]),
        }
      }
    }
  }],

  [['MOVE_DOWN'], ({st}) => {
    if (st.selectionPath.length > 0) {
      const lastIdx = st.selectionPath[st.selectionPath.length-1];
      const parentNode = nodeFromPath(st.program, st.selectionPath.slice(0, -1));
      if (lastIdx < (parentNode.children.length-1)) {
        return {
          ...st,
          selectionPath: st.selectionPath.slice(0, -1).concat([lastIdx+1]),
        }
      }
    }
  }],

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

    const node = nodeFromPath(st.program, st.selectionPath);
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

    const hit = firstUndefinedNode(newSt.program, newSt.selectionPath);
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
*/

interface ExprStreamDefinition {
  kind: 'expr';
  sid: StreamID;
  expr: StreamExpressionNode;
  desc: DescriptionNode | undefined;
}

interface ParamStreamDefinition {
  kind: 'param';
  sid: StreamID;
  desc: DescriptionNode | undefined;
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
        desc: sparam.desc,
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
              sid: sid,
              expr: node,
              desc: undefined,
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
            desc: ('desc' in node) ? node.desc : undefined,
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
    if (parent.kind === NodeKind.Application) {
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

/*
function undefineDanglingStreamRefs(state: State): State {
  const newProgram = traverseTree(state.program, {}, (node, ) => {
    if (node.type === 'StreamReference') {
      return [false, state.derivedLookups.streamIdToNode!.has(node.targetStreamId) ? node : {
        type: 'UndefinedLiteral',
        id: generateStreamId(),
        name: null,
        children: [],
      }];
    } else {
      return [false, node];
    }
  });

  return (newProgram === state.program) ? state : {
    ...state,
    program: newProgram as Program,
  }
}

function addStateCompiled(oldState: State | undefined, newState: State): State {
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
}
*/

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
      case NodeKind.StreamIndirection:
        leafward.set(node, node.expr);
        rootward.set(node.expr, node);
        break;

      case NodeKind.Application:
        setForArr(([] as ReadonlyArray<Node>).concat(node.sargs, node.fargs), node);
        break;

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

function beginEdit(state: State): State {
  if (isStreamExpressionNode(state.stableSelTree.selectedNode)) {
    return {
      ...pushUndo(state),
      editingSelTree: state.stableSelTree,
    };
  } else {
    console.log('Not starting edit because not a stream expression');
    return state;
  }
}

function pushUndo(state: State): State {
  return {
    ...state,
    undoStack: state.undoStack.concat([state.stableSelTree]),
  };
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
      return beginEdit(state);
    }
  } else if (action.type === 'TOGGLE_EDIT') {
    // TODO: should not allow confirming unless it is valid
    if (state.editingSelTree) {
      return {
        ...state,
        stableSelTree: state.editingSelTree,
        editingSelTree: null,
      };
    } else {
      return beginEdit(state);
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
    console.log('newMain', newMain);
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
      return {
        ...state,
        stableSelTree: newSelTree,
        editingSelTree: null,
        undoStack: state.undoStack.slice(0, state.undoStack.length-1),
      };
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
    console.log(newSelTree);

    if (newSelTree !== state.stableSelTree) {
      return {
        ...pushUndo(state),
        stableSelTree: newSelTree,
      };
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
    desc: { kind: NodeKind.Description, text: desc },
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
  desc: {kind: NodeKind.Description, text: 'main'},
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
        desc: {kind: NodeKind.Description, text: 'md'},
        expr: {
          kind: NodeKind.Application,
          sids: [generateStreamId()],
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
        sids: [generateStreamId()],
        func: {
          kind: NodeKind.FunctionReference,
          ref: 'showString',
        },
        sargs: [
          {
            kind: NodeKind.Application,
            sids: [generateStreamId()],
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
                kind: NodeKind.NumberLiteral,
                sid: generateStreamId(),
                val: 10,
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

export const initialState: State = initialStateFromDefinition(INITIAL_MAIN);
