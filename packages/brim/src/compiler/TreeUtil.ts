import Environment from '../util/Environment';
import { iterChildren, replaceChild, visitChildren } from './Traversal';
import { FunctionDefinitionNode, FunctionInterfaceNode, isTreeImplBodyNode, NameBindingNode, Node, NodeKind, ParamNode, TextNode, TreeImplBodyNode, TreeImplNode, UID } from './Tree';

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

interface StaticEnvironmentValue {
  creator: NameBindingNode | FunctionDefinitionNode | ParamNode;
  name?: TextNode;
  type: null | FunctionInterfaceNode;
}
export type StaticEnvironment = Environment<UID, StaticEnvironmentValue>;

export function initStaticEnv(globalFunctions: ReadonlyArray<FunctionDefinitionNode>): StaticEnvironment {
  const globalEnv: Environment<UID, StaticEnvironmentValue> = new Environment();
  for (const fdef of globalFunctions) {
    globalEnv.set(fdef.nid, {
      creator: fdef,
      type: fdef.iface,
    });
  }

  return globalEnv;
}

function extendStaticEnv(outer: StaticEnvironment, def: FunctionDefinitionNode): StaticEnvironment {
  if (def.impl.kind !== NodeKind.TreeImpl) {
    throw new Error();
  }
  const treeImpl: TreeImplNode = def.impl;

  const env: Environment<UID, StaticEnvironmentValue> = new Environment(outer);

  def.iface.params.forEach(param => {
    const internalId = treeImpl.pids.get(param.nid);
    if (!internalId) {
      throw new Error();
    }
    if (env.has(internalId)) {
      throw new Error();
    }
    env.set(internalId, {
      creator: param,
      name: param.name,
      type: param.type,
    });
  });

  const visit = (node: Node): void => {
    if (node.kind === NodeKind.StreamBinding) {
      if (node.bexpr.kind === NodeKind.NameBinding) {
        if (env.has(node.bexpr.nid)) {
          throw new Error('stream ids must be unique');
        }
        env.set(node.bexpr.nid, {
          creator: node.bexpr,
          name: node.bexpr.name,
          type: null, // TODO: this is not correct, but OK for now. if we bind a function, this should have the function's type
        });
      } else {
        throw new Error();
      }
    }

    if (node.kind === NodeKind.FunctionDefinition) {
      if (env.has(node.nid)) {
        throw new Error('function ids must be unique');
      }
      env.set(node.nid, {
        creator: node,
        type: node.iface,
      });
    } else {
      visitChildren(node, visit, undefined);
    }
  };

  visitChildren(def, visit, undefined);

  return env;
}

// compute a map from every node to its static env
export function getStaticEnvMap(root: Node, outerEnv: StaticEnvironment): Map<Node, StaticEnvironment> {
  const nodeToEnv: Map<Node, StaticEnvironment> = new Map();

  interface Context {
    env: StaticEnvironment;
    parent: Node | null;
  }

  const visit = (node: Node, ctx: Context): void => {
    nodeToEnv.set(node, ctx.env);

    let newEnv: StaticEnvironment;
    if (node.kind === NodeKind.TreeImpl) {
      const parent = ctx.parent;
      if (!parent || (parent.kind !== NodeKind.FunctionDefinition)) {
        throw new Error();
      }
      newEnv = extendStaticEnv(ctx.env, parent);
    } else {
      newEnv = ctx.env;
    }

    visitChildren(node, visit, {env: newEnv, parent: node});
  };

  visit(root, {env: outerEnv, parent: null});

  return nodeToEnv;
}
