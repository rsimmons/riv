import { State, Path, StreamID, FunctionID, Node, isNode, ProgramNode, isProgramNode, isExpressionNode, ArrayLiteralNode, isArrayLiteralNode, isApplicationNode } from './State';
import genuid from './uid';

// We don't make a discriminated union of specific actions, but maybe we could
interface Action {
  type: string;
  char?: string;
  newNode?: Node;
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
      expressions: {type: 'nodes'},
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
    }
  },

  ExternalFunction: {
    fields: {
      functionId: {type: 'uid'},
      identifier: {type: 'node'},
      parameters: {type: 'value'},
      jsFunc: {type: 'value'},
    }
  },
};

// TODO: If we want to include other classes in the lists, generate an expansion over the closure
const SCHEMA_CLASSES: {[nodeType: string]: string[]} = {
  Expression: ['UndefinedExpression', 'IntegerLiteral', 'ArrayLiteral', 'StreamReference', 'Application'],
  Any: ['Program', 'Identifier', 'UndefinedExpression', 'IntegerLiteral', 'ArrayLiteral', 'StreamReference', 'Application'],
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

const equiv = (a: any, b: any): boolean => JSON.stringify(a) === JSON.stringify(b);

function deleteExpression(node: ProgramNode, removeIdx: number): [ProgramNode, Path, boolean] {
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
  ['Program', ['MOVE_UP', 'MOVE_DOWN'], ({node, subpath, action}) => {
    if (!isProgramNode(node)) {
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

  ['Program', ['DELETE'], ({node, subpath}) => {
    if (!isProgramNode(node)) {
      throw new Error();
    }
    if ((subpath.length === 2) && (subpath[0] === 'expressions')) {
      const removeIdx = subpath[1];
      if (typeof(removeIdx) !== 'number') {
        throw new Error();
      }
      return deleteExpression(node, removeIdx);
    }
  }],

  ['Expression', ['BEGIN_EDIT'], ({node, subpath}) => {
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
  }],

  ['Expression', ['BEGIN_EDIT_FRESH'], ({node, subpath}) => {
    if (!isExpressionNode(node)) {
      throw new Error();
    }
    return [{
      type: 'UndefinedExpression',
      streamId: node.streamId,
      identifier: node.identifier,
    }, subpath, true];
  }],

  ['Expression', ['END_EXPRESSION_EDIT'], ({node, subpath}) => {
    return [node, subpath, false];
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

  ['Any', ['UPDATE_NODE'], ({subpath, action, editingSelected}) => {
    if (!action.newNode) {
      throw new Error();
    }
    if (subpath.length === 0) {
      return [action.newNode, subpath, editingSelected];
    }
  }],

  ['Program', ['INSERT_AFTER'], ({node, subpath}) => {
    if (!isProgramNode(node)) {
      throw new Error();
    }
    if ((subpath.length >= 2) && (subpath[0] === 'expressions')) {
      const afterIdx = subpath[1];
      if (typeof(afterIdx) !== 'number') {
        throw new Error();
      }
      const newNode: ProgramNode = {
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
  ['Expression', ['NAME'], ({node, subpath}) => {
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

  ['ArrayLiteral', ['INSERT_AFTER'], ({node, subpath}) => {
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
      if ((subpath[0] !== 'arguments') || (typeof(subpath[1]) !== 'number')) {
        throw Error();
      }
      return [node, [], false];
    }
  }],

  // NOTE: We only allow MOVE_RIGHT to act as ZOOM_IN here because we know arguments are displayed vertically for now
  ['Application', ['ZOOM_IN', 'MOVE_RIGHT'], ({node, subpath}) => {
    if (!isApplicationNode(node)) {
      throw new Error();
    }
    if (subpath.length === 0) {
      return [node, ['arguments', 0], false];
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

      if ((newIdx < 0) || (newIdx >= node.arguments.length)) {
        return [node, [], false];
      } else {
        return [node, ['arguments', newIdx], false];
      }
    }
  }],
];

/**
 * Returns null or [newNode, newSelectionPath, newTextEdit]
 */
function recursiveReducer(state: State, node: Node, action: Action): (null | [Node, Path, boolean]) {
  // If this node is not on the selection path, we can short circuit
  if (!nodeOnPath(node, state.root, state.selectionPath)) {
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
      const [pathBefore, pathAfter] = nodeSplitPath(node, state.root, state.selectionPath);
      const handlerResult = hfunc({
        node,
        subpath: pathAfter,
        editingSelected: state.editingSelected,
        action,
      });
      if (handlerResult) {
        console.log('handlerResult', handlerResult);
        const [handlerNewNode, handlerNewSubpath, handlerNewEditingSelected] = handlerResult;
        return [handlerNewNode, pathBefore.concat(handlerNewSubpath), handlerNewEditingSelected];
      }
    }
  }

  return null;
}

function recursiveBuildStreamMaps(node: Node, streamIdToNode: Map<StreamID, Node>, nameToNodes: Map<string, Node[]>): void {
  if (SCHEMA_CLASSES['Expression'].includes(node.type)) {
    if (!isExpressionNode(node)) {
      throw new Error();
    }

    streamIdToNode.set(node.streamId, node);

    if (node.identifier) {
      const name = node.identifier.name;
      const nodes = nameToNodes.get(name);
      if (nodes) {
        nodes.push(node);
      } else {
        nameToNodes.set(name, [node]);
      }
    }

    return;
  }

  switch (node.type) {
    case 'Program':
      for (const expression of node.expressions) {
        recursiveBuildStreamMaps(expression, streamIdToNode, nameToNodes);
      }
      break;

    default:
      throw new Error();
  }
}

export function addDerivedState(state: State) {
  const streamIdToNode: Map<StreamID, Node> = new Map();
  const nameToNodes: Map<string, Node[]> = new Map();

  recursiveBuildStreamMaps(state.root, streamIdToNode, nameToNodes);

  const functionIdToNode: Map<FunctionID, Node> = new Map();
  const nameToFunctions: Map<string, Node[]> = new Map();
  for (const extFunc of state.externalFunctions) {
    functionIdToNode.set(extFunc.functionId, extFunc);

    if (extFunc.identifier) {
      const name = extFunc.identifier.name;
      const funcs = nameToFunctions.get(name);
      if (funcs) {
        funcs.push(extFunc);
      } else {
        nameToFunctions.set(name, [extFunc]);
      }
    }
  }

  return {
    ...state,
    streamIdToNode,
    nameToNodes,
    functionIdToNode,
    nameToFunctions,
  }
}

export function reducer(state: State, action: Action): State {
  console.log('action', action.type);

  const recResult = recursiveReducer(state, state.root, action);
  if (recResult) {
    console.log('handled');
    const [newRoot, newSelectionPath, newEditingSelected] = recResult;
    console.log('new selectionPath is', newSelectionPath, 'newEditingSelected is', newEditingSelected);

    if (!isProgramNode(newRoot)) {
      throw new Error();
    }

    return {
      root: newRoot,
      selectionPath: newSelectionPath,
      editingSelected: newEditingSelected,
      externalFunctions: state.externalFunctions,
    };
  } else {
    console.log('not handled');
    return state;
  }
}

const externalFunctions: Array<[string, Array<string>, Function]> = [
  ['add', ['a', 'b'], (a: number, b: number) => a + b],
  ['showString', ['s'], (s: string) => { console.log(s); }],
  ['animationTime', [], () => {}],
  ['mouseDown', [], () => {}],
];

const fooId = genuid();
export const initialState: State = {
  root: {
    type: 'Program',
    expressions: [
      {
        type: 'IntegerLiteral',
        streamId: fooId,
        identifier: {
          type: 'Identifier',
          name: 'foo',
        },
        value: 123,
      },
      {
        type: 'IntegerLiteral',
        streamId: genuid(),
        identifier: null,
        value: 456,
      },
      {
        type: 'IntegerLiteral',
        streamId: genuid(),
        identifier: {
          type: 'Identifier',
          name: 'bar',
        },
        value: 789,
      },
      {
        type: 'ArrayLiteral',
        streamId: genuid(),
        identifier: {
          type: 'Identifier',
          name: 'an array literal',
        },
        items: [
          {
            type: 'IntegerLiteral',
            streamId: genuid(),
            identifier: null,
            value: 123,
          },
          {
            type: 'ArrayLiteral',
            streamId: genuid(),
            identifier: {
              type: 'Identifier',
              name: 'nice subarray',
            },
                items: [
              {
                type: 'IntegerLiteral',
                streamId: genuid(),
                identifier: null,
                value: 345,
              },
              {
                type: 'IntegerLiteral',
                streamId: genuid(),
                identifier: null,
                value: 456,
              },
            ],
          },
          {
            type: 'IntegerLiteral',
            streamId: genuid(),
            identifier: null,
            value: 234,
          },
        ],
      },
      {
        type: 'UndefinedExpression',
        streamId: genuid(),
        identifier: {
          type: 'Identifier',
          name: 'quux',
        },
      },
      {
        type: 'StreamReference',
        streamId: genuid(),
        identifier: null,
        targetStreamId: fooId,
      },
      {
        type: 'Application',
        streamId: genuid(),
        identifier: null,
        functionId: 'showString',
        arguments: [
          {
            type: 'UndefinedExpression',
            streamId: genuid(),
            identifier: null,
          },
        ],
      },
    ]
  },
  selectionPath: ['expressions', 0],
  editingSelected: false,
  externalFunctions: externalFunctions.map(([name, paramNames, jsFunction]) => ({
    type: 'ExternalFunction',
    functionId: name,
    identifier: {
      type: 'Identifier',
      name: name,
    },
    parameters: paramNames,
    jsFunction,
  })),
};
