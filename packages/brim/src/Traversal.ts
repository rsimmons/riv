// import { Path, pathIsPrefix } from './State';
import { NodeKind, Node, SignatureNode, DescriptionNode, StreamExpressionNode, isStreamExpressionNode, BodyExpressionNode, isBodyExpressionNode, TreeFunctionBodyNode, FunctionExpressionNode, isFunctionExpressionNode } from './Tree';

export function firstChild(node: Node): Node | undefined {
  const res = iterChildren(node).next();
  return res.done ? undefined : res.value;
}

export function lastChild(node: Node): Node | undefined {
  const children = [...iterChildren(node)];
  return children.pop();
}

export function* iterChildren(node: Node) {
  switch (node.kind) {
    case NodeKind.Description:
    case NodeKind.FunctionReference:
      // no children
      break;

    case NodeKind.UndefinedLiteral:
    case NodeKind.NumberLiteral:
    case NodeKind.StreamReference:
    case NodeKind.SignatureStreamParameter:
    case NodeKind.SignatureFunctionParameter:
    case NodeKind.SignatureYield:
      if (node.desc) {
        yield node.desc;
      }
      break;

    case NodeKind.ArrayLiteral:
      if (node.desc) {
        yield node.desc;
      }
      yield* node.elems;
      break;

    case NodeKind.Application:
      if (node.desc) {
        yield node.desc;
      }
      yield node.func;
      yield* node.sargs;
      yield* node.fargs;
      break;

    case NodeKind.Signature:
      yield* node.streamParams;
      yield* node.funcParams;
      yield* node.yields;
      break;

    case NodeKind.YieldExpression:
      yield node.expr;
      break;

    case NodeKind.TreeFunctionBody:
      yield* node.exprs;
      break;

    case NodeKind.TreeFunctionDefinition:
      if (node.desc) {
        yield node.desc;
      }
      yield node.sig;
      yield node.body;
      break;

    case NodeKind.NativeFunctionDefinition:
      if (node.desc) {
        yield node.desc;
      }
      yield node.sig;
      break;

    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
    }
  }
}

function visitArray<T>(nodeArr: ReadonlyArray<Node>, visit: (node: Node) => T | undefined): T | undefined {
  for (const node of nodeArr) {
    const result = visit(node);
    if (result) {
      return result;
    }
  }
}

/**
 * Note that this aborts if the visit function returns a truthy value.
 */
export function visitChildren<T>(node: Node, visit: (node: Node) => T | undefined): T | undefined {
  switch (node.kind) {
    case NodeKind.Description:
    case NodeKind.FunctionReference:
      // no children
      return;

    case NodeKind.UndefinedLiteral:
    case NodeKind.NumberLiteral:
    case NodeKind.StreamReference:
    case NodeKind.SignatureStreamParameter:
    case NodeKind.SignatureFunctionParameter:
    case NodeKind.SignatureYield:
      return (node.desc && visit(node.desc)) || undefined;

    case NodeKind.ArrayLiteral:
      return (node.desc && visit(node.desc)) || visitArray(node.elems, visit);

    case NodeKind.Application:
      return (node.desc && visit(node.desc)) || visit(node.func) || visitArray(node.sargs, visit) || visitArray(node.fargs, visit);

    case NodeKind.Signature:
      return visitArray(node.streamParams, visit) || visitArray(node.funcParams, visit) || visitArray(node.yields, visit);

    case NodeKind.YieldExpression:
      return visit(node.expr);

    case NodeKind.TreeFunctionBody:
      return visitArray(node.exprs, visit);

    case NodeKind.TreeFunctionDefinition:
      return (node.desc && visit(node.desc)) || visit(node.sig) || visit(node.body);

    case NodeKind.NativeFunctionDefinition:
      return (node.desc && visit(node.desc)) || visit(node.sig);

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

  const replaceSignature = (n: SignatureNode): SignatureNode => {
    if (n === oldChild) {
      if (newChild.kind !== NodeKind.Signature) {
        throw new Error();
      }
      return newChild;
    } else {
      return n;
    }
  };

  const replaceTreeBody = (n: TreeFunctionBodyNode): TreeFunctionBodyNode => {
    if (n === oldChild) {
      if (newChild.kind !== NodeKind.TreeFunctionBody) {
        throw new Error();
      }
      return newChild;
    } else {
      return n;
    }
  };

  const replaceStreamExpr = (n: StreamExpressionNode): StreamExpressionNode => {
    if (n === oldChild) {
      if (!isStreamExpressionNode(newChild)) {
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

  const replaceFunctionExpression = (n: FunctionExpressionNode): FunctionExpressionNode => {
    if (n === oldChild) {
      if (!isFunctionExpressionNode(newChild)) {
        throw new Error();
      }
      return newChild;
    } else {
      return n;
    }
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
    case NodeKind.FunctionReference:
      throw new Error('no children to replace');

    case NodeKind.UndefinedLiteral:
    case NodeKind.NumberLiteral:
    case NodeKind.StreamReference:
    case NodeKind.SignatureStreamParameter:
    case NodeKind.SignatureFunctionParameter:
    case NodeKind.SignatureYield:
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

    case NodeKind.Application:
      return {
        ...node,
        desc: replaceDesc(node.desc),
        func: replaceFunctionExpression(node.func),
        sargs: replaceStreamExprArr(node.sargs),
        // TODO: fargs
      };

    case NodeKind.Signature:
      return {
        ...node,
        // TODO: members
      };

    case NodeKind.YieldExpression:
      return {
        ...node,
        expr: replaceStreamExpr(node.expr),
      }

    case NodeKind.TreeFunctionBody:
      return {
        ...node,
        exprs: replaceBodyExprArr(node.exprs),
      }

    case NodeKind.TreeFunctionDefinition:
      return {
        ...node,
        desc: replaceDesc(node.desc),
        sig: replaceSignature(node.sig),
        body: replaceTreeBody(node.body),
      };

    case NodeKind.NativeFunctionDefinition:
      return {
        ...node,
        desc: replaceDesc(node.desc),
        sig: replaceSignature(node.sig),
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
    case NodeKind.TreeFunctionDefinition:
      throw new Error('no array-children');

    case NodeKind.ArrayLiteral:
      return {
        ...node,
        elems: filterOut(node.elems),
      };

    case NodeKind.Application:
      return {
        ...node,
        sargs: filterOut(node.sargs),
        fargs: filterOut(node.fargs),
      };

    case NodeKind.Signature:
      return {
        ...node,
        streamParams: filterOut(node.streamParams),
        funcParams: filterOut(node.funcParams),
        yields: filterOut(node.yields),
      };

    case NodeKind.TreeFunctionBody:
      return {
        ...node,
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
