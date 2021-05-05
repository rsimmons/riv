import { UID } from "../compiler/Tree";

const VIRTUAL_SELID_SEP = '#';

export function isVirtualSelId(sel: UID) {
  return sel.includes(VIRTUAL_SELID_SEP);
}

export function makeVirtualSelId(selId: UID, sub: string): UID {
  if (isVirtualSelId(selId)) {
    throw new Error();
  }
  return selId + VIRTUAL_SELID_SEP + sub;
}

export function splitVirtualSelId(selId: UID): [UID, string] {
  const result = selId.split(VIRTUAL_SELID_SEP);
  if (result.length !== 2) {
    throw new Error();
  }
  return result as [UID, string]; // not sure how to avoid this cast
}

interface SeltreeFlags {
  // Is this node a "dynamic array", whose children can
  // be deleted or have siblings inserted before/after?
  // If this is true, children must all have selId's defined.
  dynArrNonempty?: boolean;

  // Like above, but it's empty (aside from a virtual node)
  dynArrEmpty?: boolean;

  // Is this node undefined, i.e. a "hole" to be filled?
  undef?: boolean;

  // Is this node guaranteed to be the last in a "dynamic array",
  // so we disallow inserting after it?
  noInsertAfter?: boolean;
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

export function findNodeById(node: SeltreeNode, selId: UID): SeltreeNode | undefined {
  if (node.selId === selId) {
    return node;
  }
  for (const child of node.children) {
    const childResult = findNodeById(child, selId);
    if (childResult) {
      return childResult;
    }
  }

  return undefined;
}
