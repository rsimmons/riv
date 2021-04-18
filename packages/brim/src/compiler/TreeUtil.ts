import genuid from '../util/uid';
import { iterChildren, replaceChild, visitChildren } from './Traversal';
import { isStreamExpressionNode, isTreeImplBodyNode, Node, NodeKind, TreeImplBodyNode, TreeImplNode, UID, UndefinedLiteralNode } from './Tree';

// memoize this
export function getNodeIdMap(root: Node): Map<UID, Node> {
  const result: Map<UID, Node> = new Map();

  const visit = (node: Node): void => {
    result.set(node.nid, node);

    visitChildren(node, visit, undefined);
  };

  visit(root);

  return result;
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

export function getNodeParent(node: Node, root: Node): Node | undefined {
  // TODO: memoize this!
  const parentLookup = computeParentLookup(root);
  return parentLookup.get(node);
}

/**
 * Note that this returns the new root
 */
export function replaceNode(root: Node, node: Node, newNode: Node): Node {
  const parentLookup = computeParentLookup(root);

  const replaceNodeHelper = (node: Node, newNode: Node): Node => {
    const parent = parentLookup.get(node);
    if (!parent) {
      return newNode;
    }
    return replaceNodeHelper(parent, replaceChild(parent, node, newNode));
  };

  return replaceNodeHelper(node, newNode);
}

function arrInsertBeforeOrAfter<T>(arr: ReadonlyArray<T>, idx: number, before: boolean, elem: T) {
  const newIdx = before ? idx : idx+1;
  return [
    ...arr.slice(0, newIdx),
    elem,
    ...arr.slice(newIdx),
  ];
}

export function insertBeforeOrAfter(root: Node, relativeToNode: Node, newNode: Node, before: boolean): Node {
  const parentLookup = computeParentLookup(root); // TODO: memoize

  let n: Node = relativeToNode;
  while (true) {
    const parent = parentLookup.get(n);
    if (!parent) {
      throw new Error();
    }

    if (parent.kind === NodeKind.TreeImpl) {
      const idx = parent.body.indexOf(n as TreeImplBodyNode);
      if (!isTreeImplBodyNode(newNode)) {
        throw new Error();
      }
      const newTreeImpl: TreeImplNode = {
        ...parent,
        body: arrInsertBeforeOrAfter(parent.body, idx, before, newNode),
      };
      return replaceNode(root, parent, newTreeImpl);
    } else {
      n = parent;
    }
  }
}

export function deleteNode(root: Node, node: Node): [Node, Node] | void {
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

  const parentLookup = computeParentLookup(root);
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
      const newRoot = replaceNode(root, node, newNode);
      if (newRoot.kind !== NodeKind.FunctionDefinition) {
        throw new Error();
      }
      return [newRoot, newNode];
    } else if (parent.kind === NodeKind.TreeImpl) {
      const [newNodes, newSibSel] = deleteFromArr(node, parent.body);
      const newParent: TreeImplNode = {
        ...parent,
        body: newNodes,
      };
      const newRoot = replaceNode(root, parent, newParent);
      if (newRoot.kind !== NodeKind.FunctionDefinition) {
        throw new Error();
      }
      return [newRoot, newSibSel || newParent];
    } else {
      throw new Error();
    }
  }
}
