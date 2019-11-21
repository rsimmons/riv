// import { Path, pathIsPrefix } from './State';
import { NodeKind, Node, Signature, DescriptionNode, StreamExpressionNode, isStreamExpressionNode, BodyExpressionNode, isBodyExpressionNode } from './Tree';

function visitArray<T>(nodeArr: ReadonlyArray<Node>, visit: (node: Node) => T | undefined): T | undefined {
  for (const node of nodeArr) {
    const result = visit(node);
    if (result) {
      return result;
    }
  }
}

function visitSignature<T>(sig: Signature, visit: (node: Node) => T | undefined): T | undefined {
  return visitArray(sig.streamParams, visit) || visitArray(sig.funcParams, visit) || visitArray(sig.yields, visit);
}

/**
 * Note that this aborts if the visit function returns a truthy value.
 */
export function visitChildren<T>(node: Node, visit: (node: Node) => T | undefined): T | undefined {
  switch (node.kind) {
    case NodeKind.Description:
    case NodeKind.YieldExpression:
      // no children
      return;

    case NodeKind.UndefinedLiteral:
    case NodeKind.NumberLiteral:
    case NodeKind.StreamReference:
    case NodeKind.SignatureStreamParameter:
    case NodeKind.SignatureFunctionParameter:
    case NodeKind.SignatureYield:
    case NodeKind.FunctionReference:
      return (node.desc && visit(node.desc)) || undefined;

    case NodeKind.ArrayLiteral:
      return (node.desc && visit(node.desc)) || visitArray(node.elems, visit);

    case NodeKind.RefApplication:
      return (node.desc && visit(node.desc)) || visitArray(node.sargs, visit) || visitArray(node.fargs, visit);

    case NodeKind.TreeFunctionDefinition:
      return (node.desc && visit(node.desc)) || visitSignature(node.sig, visit) || visitArray(node.exprs, visit);

    case NodeKind.NativeFunctionDefinition:
      return (node.desc && visit(node.desc)) || visitSignature(node.sig, visit);

    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
    }
  }
}

export function replaceChild(node: Node, oldChild: Node, newChild: Node): Node {
  const replaceDesc = (n: DescriptionNode | null): DescriptionNode | null => {
    if (n === null) {
      return n;
    }
    if (n === oldChild) {
      if (newChild.kind !== NodeKind.Description) {
        throw new Error();
      }
      return newChild;
    } else {
      return n;
    }
  };

  const replaceStreamExprArr = (arr: ReadonlyArray<StreamExpressionNode>): ReadonlyArray<StreamExpressionNode> => {
    return arr.map((n: StreamExpressionNode) => {
      if (n === oldChild) {
        if (!isStreamExpressionNode(newChild)) {
          throw new Error();
        }
        return newChild;
      } else {
        return n;
      }
    });
  };

  const replaceBodyExprArr = (arr: ReadonlyArray<BodyExpressionNode>): ReadonlyArray<BodyExpressionNode> => {
    return arr.map((n: BodyExpressionNode) => {
      if (n === oldChild) {
        if (!isBodyExpressionNode(newChild)) {
          throw new Error();
        }
        return newChild;
      } else {
        return n;
      }
    });
  };

  switch (node.kind) {
    case NodeKind.Description:
    case NodeKind.YieldExpression:
      throw new Error('no children to replace');

    case NodeKind.UndefinedLiteral:
    case NodeKind.NumberLiteral:
    case NodeKind.StreamReference:
    case NodeKind.SignatureStreamParameter:
    case NodeKind.SignatureFunctionParameter:
    case NodeKind.SignatureYield:
    case NodeKind.FunctionReference:
      return {
        ...node,
        desc: replaceDesc(node.desc),
      };

    case NodeKind.ArrayLiteral:
      return {
        ...node,
        desc: replaceDesc(node.desc),
        elems: replaceStreamExprArr(node.elems),
      };

    case NodeKind.RefApplication:
      return {
        ...node,
        desc: replaceDesc(node.desc),
        sargs: replaceStreamExprArr(node.sargs),
        // TODO: fargs
      };

    case NodeKind.TreeFunctionDefinition:
      return {
        ...node,
        desc: replaceDesc(node.desc),
        // TODO: signature
        exprs: replaceBodyExprArr(node.exprs),
      };

    case NodeKind.NativeFunctionDefinition:
      return {
        ...node,
        desc: replaceDesc(node.desc),
        // TODO: signature
      };

    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
      throw new Error(); // should be unreachable
    }
  }
}

export function deleteArrayElementChild(node: Node, child: Node): Node {
  const filterOut = <T extends Node>(arr: ReadonlyArray<T>) => arr.filter(elem => elem !== child);

  switch (node.kind) {
    case NodeKind.Description:
    case NodeKind.YieldExpression:
    case NodeKind.UndefinedLiteral:
    case NodeKind.NumberLiteral:
    case NodeKind.StreamReference:
    case NodeKind.SignatureStreamParameter:
    case NodeKind.SignatureFunctionParameter:
    case NodeKind.SignatureYield:
    case NodeKind.FunctionReference:
      throw new Error('no array-children');

    case NodeKind.ArrayLiteral:
      return {
        ...node,
        elems: filterOut(node.elems),
      };

    case NodeKind.RefApplication:
      return {
        ...node,
        sargs: filterOut(node.sargs),
        fargs: filterOut(node.fargs),
      };

    case NodeKind.TreeFunctionDefinition:
      return {
        ...node,
        // TODO: signature
        exprs: filterOut(node.exprs),
      };

    case NodeKind.NativeFunctionDefinition:
      throw new Error('unimplemented');

    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
      throw new Error(); // should be unreachable
    }
  }
}

/*
type TraversalVisitor = (node: Node, path: Path) => [boolean, Node];

interface TraversalOptions {
  onlyWithinFunctionId?: FunctionID; // so as to not traverse into contained function definitions
  alongPath?: Path;
}

// Returns [exit, newNode]. exit indicates an early end to traversal. newNode returns replacement node, which may be the same node
function recursiveTraverseTree(node: Node, path: Path, options: TraversalOptions, visit: TraversalVisitor): [boolean, Node] {
  if (options.alongPath && !pathIsPrefix(path, options.alongPath)) {
    return [false, node];
  }

  let newNode: Node = node;

  // Recurse
  if (!(options.onlyWithinFunctionId && (isTreeFunctionDefinitionNode(node) && (node.id !== options.onlyWithinFunctionId)))) {
    let exited = false;

    let newChildren: Array<Node> = [];
    let anyNewChildren = false;

    newNode.children.forEach((child: Node, idx: number) => {
      if (exited) {
        newChildren.push(child);
      } else {
        const [exit, newChild] = recursiveTraverseTree(child, path.concat([idx]), options, visit);
        if (exit) exited = true;
        newChildren.push(newChild);
        if (newChild !== child) {
          anyNewChildren = true;
        }
      }
    });

    if (anyNewChildren) {
      newNode = {
        ...newNode,
        children: newChildren,
      } as Node;
    }

    if (exited) {
      return [exited, newNode];
    }
  }

  return visit(newNode, path);
}

// Post-order traversal. Avoids returning new node unless something has changed.
export function traverseTree(node: Node, options: TraversalOptions, visit: TraversalVisitor): Node {
  const [, newNode] = recursiveTraverseTree(node, [], options, visit);
  return newNode;
}





interface TraversalVisitors {
  visitTreeDefinition: (node: TreeFunctionDefinitionNode) => void;
}

export function traverseTreeFunctionDefinition(node: TreeFunctionDefinitionNode, visitors: TraversalVisitors) {
  if (visitors.visitTreeDefinition) {
    visitors.visitTreeDefinition(node);
  }
}
*/
