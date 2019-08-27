import { State, Path, StreamID, FunctionID, Node, isNode, isProgramNode, ExpressionNode, isExpressionNode, ArrayLiteralNode, isArrayLiteralNode, FunctionSignature, FunctionNode, isApplicationNode, UserFunctionNode, isUserFunctionNode, ProgramNode } from './State';
import genuid from './uid';
import { compileUserDefinition, CompilationError, CompiledDefinition } from './Compiler';
import { createNullaryVoidRootExecutionContext, beginBatch, endBatch } from 'riv-runtime';
import { createLiveFunction, Environment } from './LiveFunction';
const { showString, animationTime, mouseDown, changeCount, streamMap, audioDriver, random, mouseClickEvts } = require('riv-demo-lib');

// We don't make a discriminated union of specific actions, but maybe we could
interface Action {
  type: string;
  char?: string;
  newNode?: Node;
  newPath?: Path;
}

interface HandlerArgs {
  node: Node,
  subpath: Path,
  editingSelected: boolean,
  action: Action;
}
type HandlerResult = (undefined | [Node, Path, boolean]);
type Handler = [string, string[], (args: HandlerArgs) => HandlerResult];


const SCHEMA_NODES = {
  Program: {
    fields: {
      mainDefinition: {type: 'node'},
    }
  },

  Identifier: {
    fields: {
      name: {type: 'value'},
    }
  },

  UndefinedExpression: {
    fields: {
      streamId: {type: 'uid'},
      identifier: {type: 'node'},
    }
  },

  IntegerLiteral: {
    fields: {
      streamId: {type: 'uid'},
      identifier: {type: 'node'},
      value: {type: 'value'},
    }
  },

  ArrayLiteral: {
    fields: {
      streamId: {type: 'uid'},
      identifier: {type: 'node'},
      items: {type: 'nodes'},
    }
  },

  StreamReference: {
    fields: {
      streamId: {type: 'uid'},
      identifier: {type: 'node'},
      targetStreamId: {type: 'uid'},
    }
  },

  Application: {
    fields: {
      streamId: {type: 'uid'},
      identifier: {type: 'node'},
      functionId: {type: 'uid'},
      arguments: {type: 'nodes'},
      functionArguments: {type: 'nodes'},
    }
  },

  Parameter: {
    fields: {
      streamId: {type: 'uid'},
      identifier: {type: 'node'},
    }
  },

  NativeFunction: {
    fields: {
      functionId: {type: 'uid'},
      identifier: {type: 'node'},
      signature: {type: 'value'},
      jsFunction: {type: 'value'},
    }
  },

  UserFunction: {
    fields: {
      functionId: {type: 'uid'},
      identifier: {type: 'node'},
      signature: {type: 'value'},
      parameters: {type: 'nodes'},
      functionParameterFunctionIds: {type: 'value'},
      expressions: {type: 'nodes'},
    }
  },
};

// TODO: If we want to include other classes in the lists, generate an expansion over the closure
const SCHEMA_CLASSES: {[nodeType: string]: string[]} = {
  Expression: ['UndefinedExpression', 'IntegerLiteral', 'ArrayLiteral', 'StreamReference', 'Application', 'Parameter'],
  Any: ['Program', 'Identifier', 'UndefinedExpression', 'IntegerLiteral', 'ArrayLiteral', 'StreamReference', 'Application', 'NativeFunction', 'UserFunction'],
}

export function nodeFromPath(root: Node, path: Path): Node {
  let cur: any = root;
  for (const seg of path) {
    cur = cur[seg];
  }
  return cur;
}

export function nodeOnPath(node: Node, root: Node, path: Path): boolean {
  if (node === root) {
    return true;
  }

  let cur: any = root;
  for (const seg of path) {
    cur = cur[seg];
    if (node === cur) {
      return true;
    }
  }

  return false;
}

export function nodeSplitPath(node: Node, root: Node, path: Path): [Path, Path] {
  let cur: any = root;
  let idx = 0;
  for (const seg of path) {
    if (node === cur) {
      return [path.slice(0, idx), path.slice(idx)];
    }
    cur = cur[seg];
    idx++;
  }

  if (node === cur) {
    return [path.slice(0, idx), path.slice(idx)];
  } else {
    throw new Error('node was not in path');
  }
}

export function addExpressionLocalEnvironment(expr: ExpressionNode, namedStreams: Array<[string, ExpressionNode]>, namedFunctions: Array<[string, FunctionNode]>) {
  if (expr.identifier) {
    namedStreams.push([expr.identifier.name, expr]);
  }

  switch (expr.type) {
    case 'Application':
      for (const sarg of expr.arguments) {
        addExpressionLocalEnvironment(sarg, namedStreams, namedFunctions);
      }
      for (const farg of expr.functionArguments) {
        // NOTE: We don't recurse into the function-argument since we only want the local scope
        if (farg.identifier) {
          namedFunctions.push([farg.identifier.name, farg]);
        }
      }
      break;

    case 'ArrayLiteral':
      for (const item of expr.items) {
        addExpressionLocalEnvironment(item, namedStreams, namedFunctions);
      }
      break;

    case 'StreamReference':
    case 'IntegerLiteral':
    case 'UndefinedExpression':
      // nothing to do
      break;

    default:
      throw new Error();
  }
}

export function addUserFunctionLocalEnvironment(func: UserFunctionNode, namedStreams: Array<[string, ExpressionNode]>, namedFunctions: Array<[string, FunctionNode]>) {
  for (const param of func.parameters) {
    if (param.identifier) {
      namedStreams.push([param.identifier.name, param]);
    }
  }

  for (const exp of func.expressions) {
    addExpressionLocalEnvironment(exp, namedStreams, namedFunctions);
  }
}

export function addEnvironmentAlongPath(root: Node, path: Path, namedStreams: Array<[string, ExpressionNode]>, namedFunctions: Array<[string, FunctionNode]>) {
  let cur: Node = root;
  for (const seg of path) {
    if (cur.type === 'UserFunction') {
      addUserFunctionLocalEnvironment(cur, namedStreams, namedFunctions);
    }
    cur = (cur as any)[seg];
  }
}

export function environmentForSelectedNode(state: State) {
  const namedStreams: Array<[string, ExpressionNode]> = [];
  const namedFunctions: Array<[string, FunctionNode]> = [];

  for (const extFunc of state.nativeFunctions) {
    if (extFunc.identifier) {
      namedFunctions.push([extFunc.identifier.name, extFunc]);
    }
  }

  addEnvironmentAlongPath(state.program, state.selectionPath, namedStreams, namedFunctions);

  return {
    namedStreams,
    namedFunctions,
  }
}

const equiv = (a: any, b: any): boolean => JSON.stringify(a) === JSON.stringify(b);

function deleteDefinitionExpression(node: UserFunctionNode, removeIdx: number): [UserFunctionNode, Path, boolean] {
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
    return [newNode, ['expressions', newIdx], false];
  } else {
    // We've deleted all expressions, so make a single empty one.
    newNode.expressions.push({
      type: 'UndefinedExpression',
      streamId: genuid(),
      identifier: null,
    });
    return [newNode, ['expressions', 0], true];
  }
}

const HANDLERS: Handler[] = [
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
      return [node, ['expressions', newExpressionIdx()], false];
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
      return [node, ['expressions', 0], false];
    }
  }],

  ['Expression', ['TOGGLE_EDIT'], ({node, subpath, editingSelected}) => {
    if (editingSelected) {
      return [node, subpath, false];
    } else {
      switch (node.type) {
        case 'IntegerLiteral':
        case 'UndefinedExpression':
        case 'StreamReference':
        case 'Application':
          return [node, subpath, true];

        case 'ArrayLiteral':
          // Can't directly edit
          break;

        default:
          throw new Error();
      }
    }
  }],

  ['Expression', ['END_EXPRESSION_IDENTIFIER_EDIT'], ({node, subpath}) => {
    if (!isExpressionNode(node)) {
      throw new Error();
    }
    if (!equiv(subpath, ['identifier'])) {
      throw new Error();
    }
    if (!node.identifier) {
      throw new Error();
    }
    const trimmedName = node.identifier.name.trim();
    return [{
      ...node,
      identifier: trimmedName ? {
        type: 'Identifier',
        name: trimmedName,
      } : null,
    }, [], false];
  }],

  ['Expression', ['BEGIN_OVERWRITE_EDIT'], ({node, subpath}) => {
    if (!isExpressionNode(node)) {
      throw new Error();
    }
    return [{
      type: 'UndefinedExpression',
      streamId: node.streamId,
      identifier: node.identifier,
    }, subpath, true];
  }],

  ['Any', ['UPDATE_NODE'], ({subpath, action, editingSelected}) => {
    if (!action.newNode) {
      throw new Error();
    }
    console.log('UPDATE_NODE newNode', action.newNode);
    if (subpath.length === 0) {
      return [action.newNode, subpath, editingSelected];
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
      const newNode: UserFunctionNode = {
        ...node,
        expressions: [
          ...node.expressions.slice(0, afterIdx+1),
          {
            type: 'UndefinedExpression',
            streamId: genuid(),
            identifier: null,
          },
          ...node.expressions.slice(afterIdx+1),
        ],
      };
      return [newNode, ['expressions', afterIdx+1], true];
    }
  }],

  /**
   * NAME on an expression will move to editing identifer.
   */
  ['Expression', ['BEGIN_EXPRESSION_IDENTIFIER_EDIT'], ({node, subpath}) => {
    if (!isExpressionNode(node)) {
      throw new Error();
    }
    if (equiv(subpath, [])) {
      return [{
        ...node,
        identifier: node.identifier ? node.identifier : {type: 'Identifier', name: ''},
      }, ['identifier'], true];
    }
  }],

  // NOTE: We only allow MOVE_LEFT to act as ZOOM_OUT here because we know array is displayed vertically for now
  ['ArrayLiteral', ['ZOOM_OUT', 'MOVE_LEFT'], ({node, subpath}) => {
    if (subpath.length === 2) {
      if ((subpath[0] !== 'items') || (typeof(subpath[1]) !== 'number')) {
        throw Error();
      }
      return [node, [], false];
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
        return [{
          ...node,
          items: [
            {
              type: 'UndefinedExpression',
              streamId: genuid(),
              identifier: null,
            }
          ],
        }, ['items', 0], true];
      } else {
        return [node, ['items', 0], false];
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
        return [node, [], false];
      } else {
        return [node, ['items', newIdx], false];
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
      const newNode: ArrayLiteralNode = {
        ...node,
        items: [
          ...node.items.slice(0, afterIdx+1),
          {
            type: 'UndefinedExpression',
            streamId: genuid(),
            identifier: null,
          },
          ...node.items.slice(afterIdx+1),
        ],
      };
      return [newNode, ['items', afterIdx+1], true];
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
        return [newNode, ['items', newIdx], false];
      } else {
        return [newNode, [], false];
      }
    }
  }],

  ['Expression', ['CREATE_ARRAY'], ({node, subpath}) => {
    if (!isExpressionNode(node)) {
      throw new Error();
    }

    if (subpath.length === 0) {
      return [{
        type: 'ArrayLiteral',
        streamId: node.streamId,
        identifier: node.identifier,
        items: [
          {
            type: 'UndefinedExpression',
            identifier: null,
            streamId: genuid(),
          }
        ],
      }, ['items', 0], true];
    }
  }],

  // NOTE: We only allow MOVE_LEFT to act as ZOOM_OUT here because we know arguments are displayed vertically for now
  ['Application', ['ZOOM_OUT', 'MOVE_LEFT'], ({node, subpath}) => {
    if (!isApplicationNode(node)) {
      throw new Error();
    }
    if (subpath.length === 2) {
      if ((subpath[0] === 'arguments') && (typeof(subpath[1]) === 'number')) {
        return [node, [], false];
      } else if ((subpath[0] === 'functionArguments') && (typeof(subpath[1]) === 'number')) {
        return [node, [], false];
      } else {
        throw new Error();
      }
    } else if ((subpath.length >= 3) && (subpath[0] === 'functionArguments') && (typeof(subpath[1]) === 'number')) {
      // We handle this here (slightly unusual) so that user can't zoom out to main function definition
      return [node, subpath.slice(0, 2), false];
    }
  }],

  // NOTE: We only allow MOVE_RIGHT to act as ZOOM_IN here because we know arguments are displayed vertically for now
  ['Application', ['ZOOM_IN', 'MOVE_RIGHT'], ({node, subpath}) => {
    if (!isApplicationNode(node)) {
      throw new Error();
    }
    if (subpath.length === 0) {
      if (node.arguments.length > 0) {
        return [node, ['arguments', 0], false];
      } else if (node.functionArguments.length > 0) {
        return [node, ['functionArguments', 0], false];
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
        return [node, ['functionArguments', 0], false];
      } else if ((newIdx < 0) || (newIdx >= node.arguments.length)) {
        return [node, [], false];
      } else {
        return [node, ['arguments', newIdx], false];
      }
    } else if ((subpath.length === 2) && (subpath[0] === 'functionArguments')) {
      const idx = subpath[1];
      if (typeof idx !== 'number') {
        throw new Error();
      }
      const newIdx = idx + ((action.type === 'MOVE_UP') ? -1 : 1);

      if ((newIdx < 0) && node.arguments.length) {
        return [node, ['arguments', node.arguments.length-1], false];
      } else if ((newIdx < 0) || (newIdx >= node.arguments.length)) {
        return [node, [], false];
      } else {
        return [node, ['functionArguments', newIdx], false];
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
      }, ['arguments', idx], false];
    }
  }],
];

/**
 * Returns null or [newNode, newSelectionPath, newTextEdit]
 */
function recursiveReducer(state: State, node: Node, action: Action): (null | [Node, Path, boolean]) {
  // If this node is not on the selection path, we can short circuit
  if (!nodeOnPath(node, state.program, state.selectionPath)) {
    return null;
  }

  // Build new node, recursing into any child nodes
  // If nothing has changed, we try to return the original object to allow callers to memoize
  const nodeInfo = SCHEMA_NODES[node.type];
  if (!nodeInfo) {
    throw new Error();
  }
  const newNode: any = {
    type: node.type,
  };
  let newSelPath = null;
  let newEditingSelected = false;
  let handled = false;
  const indexableNode = node as {[prop: string]: any}; // to avoid type errors
  for (const [fieldName, fieldInfo] of Object.entries(nodeInfo.fields)) {
    switch (fieldInfo.type) {
      case 'node': {
        const childNode = indexableNode[fieldName];
        const recResult = recursiveReducer(state, childNode, action);
        if (recResult) {
          if (handled) {
            throw new Error('already handled');
          }
          const [n, sp, es] = recResult;
          newNode[fieldName] = n;
          newSelPath = sp;
          newEditingSelected = es;
          handled = true;
        } else {
          newNode[fieldName] = childNode;
        }
        break;
      }

      case 'nodes': {
        const newArr = [];
        const childNodes = indexableNode[fieldName];
        for (const arrn of childNodes) {
          const recResult = recursiveReducer(state, arrn, action);
          if (recResult) {
            if (handled) {
              throw new Error('already handled');
            }
            const [n, sp, es] = recResult;
            newArr.push(n);
            newSelPath = sp;
            newEditingSelected = es;
            handled = true;
          } else {
            newArr.push(arrn);
          }
        }
        newNode[fieldName] = newArr;
        break;
      }

      case 'value':
        newNode[fieldName] = indexableNode[fieldName];
        break;

      case 'uid':
        newNode[fieldName] = indexableNode[fieldName];
        break;

      default:
        throw new Error();
    }
  }

  // If the action has been handled, we can return now
  if (handled) {
    if (!isNode(newNode)) {
      throw new Error();
    }
    if (!newSelPath) {
      throw new Error();
    }
    return [newNode, newSelPath, newEditingSelected];
  }

  // Try any matching handlers
  for (const [nt, acts, hfunc] of HANDLERS) {
    const matchingTypes = SCHEMA_CLASSES[nt] ? SCHEMA_CLASSES[nt] : [nt];
    if (matchingTypes.includes(node.type) && acts.includes(action.type)) {
      const [pathBefore, pathAfter] = nodeSplitPath(node, state.program, state.selectionPath);
      const handlerResult = hfunc({
        node,
        subpath: pathAfter,
        editingSelected: state.editingSelected,
        action,
      });
      if (handlerResult) {
        // console.log('handlerResult', handlerResult);
        const [handlerNewNode, handlerNewSubpath, handlerNewEditingSelected] = handlerResult;
        return [handlerNewNode, pathBefore.concat(handlerNewSubpath), handlerNewEditingSelected];
      }
    }
  }

  return null;
}

function recursiveBuildIdMaps(node: Node, streamIdToNode: Map<StreamID, Node>, functionIdToNode: Map<FunctionID, FunctionNode>): void {
  if (isExpressionNode(node)) {
    if (streamIdToNode.has(node.streamId)) {
      throw new Error('stream ids must be unique');
    }
    streamIdToNode.set(node.streamId, node);
  }

  switch (node.type) {
    case 'Program':
      recursiveBuildIdMaps(node.mainDefinition, streamIdToNode, functionIdToNode);
      break;

    case 'UserFunction':
      if (functionIdToNode.has(node.functionId)) {
        throw new Error('function ids must be unique');
      }
      functionIdToNode.set(node.functionId, node);

      for (const param of node.parameters) {
        if (streamIdToNode.has(param.streamId)) {
          throw new Error('stream ids must be unique');
        }
        streamIdToNode.set(param.streamId, param);
      }

      node.expressions.forEach((expression, idx) => {
        recursiveBuildIdMaps(expression, streamIdToNode, functionIdToNode);
      });
      break;

    case 'Application':
      node.arguments.forEach((arg, idx) => {
        recursiveBuildIdMaps(arg, streamIdToNode, functionIdToNode);
      });
      node.functionArguments.forEach((farg, idx) => {
        recursiveBuildIdMaps(farg, streamIdToNode, functionIdToNode);
      });
      break;

    case 'ArrayLiteral':
      node.items.forEach((item, idx) => {
        recursiveBuildIdMaps(item, streamIdToNode, functionIdToNode);
      })
      break;

    case 'IntegerLiteral':
    case 'UndefinedExpression':
    case 'StreamReference':
      // NOTE: nothing to recurse into
      break;

    default:
      throw new Error();
  }
}

function recursiveBuildPathMap(node: Node, path: Path, nodeToPath: Map<Node, Path>): void {
  nodeToPath.set(node, path);

  switch (node.type) {
    case 'Program':
      recursiveBuildPathMap(node.mainDefinition, path.concat(['mainDefinition']), nodeToPath);
      break;

    case 'UserFunction':
      node.expressions.forEach((expression, idx) => {
        recursiveBuildPathMap(expression, path.concat(['expressions', idx]), nodeToPath);
      });
      break;

    case 'Application':
      node.arguments.forEach((arg, idx) => {
        recursiveBuildPathMap(arg, path.concat(['arguments', idx]), nodeToPath);
      });
      node.functionArguments.forEach((farg, idx) => {
        recursiveBuildPathMap(farg, path.concat(['functionArguments', idx]), nodeToPath);
      });
      break;

    case 'ArrayLiteral':
      node.items.forEach((item, idx) => {
        recursiveBuildPathMap(item, path.concat(['items', idx]), nodeToPath);
      })
      break;

    case 'IntegerLiteral':
    case 'UndefinedExpression':
    case 'StreamReference':
      // NOTE: nothing to recurse into
      break;

    default:
      throw new Error();
  }
}

function addStateIdLookups(state: State): State {
  const streamIdToNode: Map<StreamID, ExpressionNode> = new Map();
  const functionIdToNode: Map<FunctionID, FunctionNode> = new Map();
  const nodeToPath: Map<Node, Path> = new Map();

  for (const extFunc of state.nativeFunctions) {
    functionIdToNode.set(extFunc.functionId, extFunc);
  }

  recursiveBuildIdMaps(state.program, streamIdToNode, functionIdToNode);

  return {
    ...state,
    derivedLookups: {
      streamIdToNode,
      functionIdToNode,
      nodeToPath,
    },
  };
}

function addStatePathLookup(state: State): State {
  const nodeToPath: Map<Node, Path> = new Map();

  recursiveBuildPathMap(state.program, [], nodeToPath);

  return {
    ...state,
    derivedLookups: {
      ...state.derivedLookups,
      nodeToPath,
    },
  };
}

function recursiveUndefineDanglingStreamRefs(node: Node, streamIdToNode: Map<StreamID, Node>): Node {
  switch (node.type) {
    case 'Program':
      return {
        ...node,
        mainDefinition: recursiveUndefineDanglingStreamRefs(node.mainDefinition, streamIdToNode) as UserFunctionNode,
      };

    case 'UserFunction':
      return {
        ...node,
        expressions: node.expressions.map(expr => recursiveUndefineDanglingStreamRefs(expr, streamIdToNode)) as Array<ExpressionNode>,
      };

    case 'Application':
      return {
        ...node,
        arguments: node.arguments.map(arg => recursiveUndefineDanglingStreamRefs(arg, streamIdToNode)) as Array<ExpressionNode>,
        functionArguments: node.functionArguments.map(farg => recursiveUndefineDanglingStreamRefs(farg, streamIdToNode)) as Array<UserFunctionNode>,
      };

    case 'ArrayLiteral':
      return {
        ...node,
        items: node.items.map(item => recursiveUndefineDanglingStreamRefs(item, streamIdToNode)) as Array<ExpressionNode>,
      };

    case 'IntegerLiteral':
    case 'UndefinedExpression':
      // NOTE: nothing to do
      return node;

    case 'StreamReference':
      // This is the important case
      return streamIdToNode.has(node.targetStreamId) ? node : {
        type: 'UndefinedExpression',
        streamId: genuid(),
        identifier: node.identifier,
      };

    default:
      throw new Error();
  }
}

function undefineDanglingStreamRefs(state: State): State {
  return {
    ...state,
    program: recursiveUndefineDanglingStreamRefs(state.program, state.derivedLookups.streamIdToNode!) as ProgramNode,
  }
}

function addStateCompiled(oldState: State | undefined, newState: State): State {
  // We initialize with an "empty" definition, which we fall back on if compilation fails
  let newCompiledDefinition: CompiledDefinition = {
    parameterStreams: [],
    literalStreamValues: [],
    applications: [],
    containedDefinitions: [],
    yieldStream: null,
  };

  try {
    newCompiledDefinition = compileUserDefinition(newState.program.mainDefinition, newState);
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

    console.log('updating compiled definition to', newCompiledDefinition);
    beginBatch(); // batch thing is not necessary yet, but will be in the future
    updateCompiledDefinition(newCompiledDefinition);
    endBatch();

    newLiveMain = {
      context,
      updateCompiledDefinition,
      compiledDefinition: newCompiledDefinition,
    };
  } else {
    // There is no old state, so we need to create the long-lived stuff
    console.log('initializing compiled definition to', newCompiledDefinition);
    const [liveStreamFunc, updateCompiledDefinition] = createLiveFunction(newCompiledDefinition, new Environment(), nativeFunctionEnvironment);
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

function addDerivedState(oldState: State | undefined, newState: State): State {
  // undefineDanglingStreamRefs needs up-to-date id lookups
  const danglingRemovedState = undefineDanglingStreamRefs(addStateIdLookups(newState));

  return addStateCompiled(oldState, addStatePathLookup(addStateIdLookups(danglingRemovedState)));
}

export function reducer(state: State, action: Action): State {
  console.log('action', action.type);

  let newCore: (null | [Node, Path, boolean]) = null;

  if (action.type === 'SET_PATH') {
    newCore = [state.program, action.newPath!, false];
  } else {
    newCore = recursiveReducer(state, state.program, action);
  }

  if (newCore) {
    console.log('handled');
    const [newProgram, newSelectionPath, newEditingSelected] = newCore;
    // console.log('new selectionPath is', newSelectionPath, 'newEditingSelected is', newEditingSelected);
    // console.log('new prog', newProgram);

    if (!isProgramNode(newProgram)) {
      throw new Error();
    }

    return addDerivedState(state, {
      program: newProgram,
      selectionPath: newSelectionPath,
      editingSelected: newEditingSelected,
      nativeFunctions: state.nativeFunctions,
      derivedLookups: {
        streamIdToNode: undefined,
        functionIdToNode: undefined,
        nodeToPath: undefined,
      },
      liveMain: undefined,
    });
  } else {
    console.log('not handled');
    return state;
  }
}

const nativeFunctions: Array<[string, Array<string>, Array<[string, FunctionSignature]>, Function]> = [
  ['add', ['_a', '_b'], [], (a: number, b: number) => a + b],
  ['multiply', ['_a', '_b'], [], (a: number, b: number) => a * b],
  ['show value', ['_v'], [], showString],
  ['animation time', [], [], animationTime],
  ['is mouse down', [], [], mouseDown],
  ['change count', ['_stream'], [], changeCount],
  ['map', ['_array'], [['_func', {parameters: ['value'], functionParameters: []}]], (arr: Array<any>, f: (v: any) => any) => streamMap(f, arr)],
  ['if', ['cond', 'then', 'else'], [], (cond: any, _then: any, _else: any) => (cond ? _then : _else)],
  ['audio driver', [], [['_func', {parameters: ['audio time', 'next frame', 'sample rate'], functionParameters: []}]], audioDriver],
  ['cosine', ['_v'], [], Math.cos],
  ['random', ['repick'], [], random],
  ['mouse click', [], [], mouseClickEvts],
];

const nativeFunctionEnvironment: Environment<Function> = new Environment();
nativeFunctionEnvironment.set('id', (x: any) => x);
nativeFunctionEnvironment.set('Array_of', Array.of);
nativeFunctions.forEach(([name, , , jsFunc]) => {
  nativeFunctionEnvironment.set(name, jsFunc);
});

const mdId = genuid();
export const initialState: State = addDerivedState(undefined, {
  program: {
    type: 'Program',
    mainDefinition: {
      type: 'UserFunction',
      functionId: genuid(),
      identifier: null,
      signature: {
        parameters: [],
        functionParameters: [],
      },
      parameters: [],
      functionParameterFunctionIds: [],
      expressions: [
        {
          type: 'Application',
          streamId: mdId,
          identifier: {
            type: 'Identifier',
            name: 'md',
          },
          functionId: 'is mouse down',
          arguments: [],
          functionArguments: [],
        },
        {
          type: 'Application',
          streamId: genuid(),
          identifier: null,
          functionId: 'show value',
          arguments: [
            {
              type: 'Application',
              streamId: genuid(),
              identifier: null,
              functionId: 'if',
              arguments: [
                {
                  type: 'StreamReference',
                  streamId: genuid(),
                  identifier: null,
                  targetStreamId: mdId,
                },
                {
                  type: 'IntegerLiteral',
                  streamId: genuid(),
                  identifier: null,
                  value: 10,
                },
                {
                  type: 'IntegerLiteral',
                  streamId: genuid(),
                  identifier: null,
                  value: 20,
                },
              ],
              functionArguments: [],
            },
          ],
          functionArguments: [],
        },
      ],
    },
  },
  selectionPath: ['mainDefinition', 'expressions', 0],
  editingSelected: false,
  nativeFunctions: nativeFunctions.map(([name, paramNames, funcParams, ]) => ({
    type: 'NativeFunction',
    functionId: name,
    identifier: {
      type: 'Identifier',
      name: name,
    },
    signature: {
      parameters: paramNames,
      functionParameters: funcParams,
    },
  })),
  derivedLookups: {
    streamIdToNode: undefined,
    functionIdToNode: undefined,
    nodeToPath: undefined,
  },
  liveMain: undefined,
});
