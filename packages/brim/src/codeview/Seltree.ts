import { UID } from "../compiler/Tree";

interface SeltreeFlags {
  // Is this node a "dynamic array", whose children can
  // be deleted or have siblings inserted before/after?
  dyn?: boolean;

  // Is this node undefined, i.e. a "hole" to be filled?
  undef?: boolean;
}

export interface SeltreeNode {
  readonly selId?: UID; // must be present if a leaf
  readonly dir: 'block' | 'inline';
  readonly children: ReadonlyArray<SeltreeNode>;
  readonly flags: SeltreeFlags;
  readonly special?: string;
}

interface SeltreeLookups {
  parentAndIdx: ReadonlyMap<SeltreeNode, [SeltreeNode, number]>;
  selIdToNode: ReadonlyMap<UID, SeltreeNode>;
}

export function computeSeltreeLookups(root: SeltreeNode): SeltreeLookups {
  const parentAndIdx: Map<SeltreeNode, [SeltreeNode, number]> = new Map();
  const selIdToNode: Map<UID, SeltreeNode> = new Map();

  const traverse = (node: SeltreeNode): void => {
    if (node.selId !== undefined) {
      selIdToNode.set(node.selId, node);
    }

    let i = 0;
    for (const child of node.children) {
      parentAndIdx.set(child, [node, i]);
      i++;

      traverse(child);
    }
  };

  traverse(root);

  return {
    parentAndIdx,
    selIdToNode,
  };
}

export function findFirstUndef(root: SeltreeNode): UID | undefined {
  if (root.flags.undef && root.selId) {
    return root.selId;
  }

  for (const child of root.children) {
    const childFirst = findFirstUndef(child);
    if (childFirst) {
      return childFirst;
    }
  }

  return undefined;
}