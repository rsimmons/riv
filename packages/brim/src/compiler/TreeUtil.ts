import { iterChildren, visitChildren } from './Traversal';
import { Node, UID } from './Tree';

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
