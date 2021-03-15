// import { Path, pathIsPrefix } from './State';
import { NodeKind, Node, NameNode, StreamExpressionNode, isStreamExpressionNode, BodyExpressionNode, isBodyExpressionNode, ApplicationOutNode, FunctionDefinitionNode, isFunctionDefinitionNode, FunctionInterfaceNode, ApplicationArgNode, ApplicationArgs, isApplicationArgNode, FIReturnNode, FIVoidNode, FIParamNode, isFIParamNode } from './Tree';

export function firstChild(node: Node): Node | undefined {
  const res = iterChildren(node).next();
  return res.done ? undefined : res.value;
}

export function lastChild(node: Node): Node | undefined {
  const children = [...iterChildren(node)];
  return children.pop();
}

export function* iterChildren(node: Node): Generator<Node, void, undefined> {
  switch (node.kind) {
    case NodeKind.Name:
    case NodeKind.ApplicationOut:
    case NodeKind.UndefinedLiteral:
    case NodeKind.NumberLiteral:
    case NodeKind.TextLiteral:
    case NodeKind.BooleanLiteral:
    case NodeKind.StreamReference:
    case NodeKind.FIVoid:
    case NodeKind.FIReturn:
      // no children
      break;

    case NodeKind.Application:
      yield* node.args.values();
      break;

    case NodeKind.YieldExpression:
      yield node.expr;
      break;

    case NodeKind.FIStreamParam:
    case NodeKind.FIOutParam:
      yield node.name;
      break;

    case NodeKind.FIFunctionParam:
      yield node.name;
      yield node.iface;
      break;

    case NodeKind.FunctionInterface:
      yield node.name;
      yield* node.params;
      yield node.ret;
      break;

    case NodeKind.NativeFunctionDefinition:
      yield node.iface;
      break;

    case NodeKind.TreeFunctionDefinition:
      yield node.iface;
      yield* node.bodyExprs;
      break;

    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
    }
  }
}

function visitArray<N, C>(nodeArr: ReadonlyArray<Node>, visit: (node: Node, ctx: C) => N | undefined, ctx: C): N | undefined {
  for (const node of nodeArr) {
    const result = visit(node, ctx);
    if (result) {
      return result;
    }
  }
}

/**
 * Note that this aborts if the visit function returns a truthy value.
 */
export function visitChildren<N, C>(node: Node, visit: (node: Node, ctx: C) => N | undefined, ctx: C): N | undefined {
  switch (node.kind) {
    case NodeKind.Name:
    case NodeKind.ApplicationOut:
    case NodeKind.UndefinedLiteral:
    case NodeKind.NumberLiteral:
    case NodeKind.TextLiteral:
    case NodeKind.BooleanLiteral:
    case NodeKind.StreamReference:
    case NodeKind.FIReturn:
    case NodeKind.FIVoid:
      // no children
      return;

    case NodeKind.Application:
      return visitArray([...node.args.values()], visit, ctx);

    case NodeKind.YieldExpression:
      return visit(node.expr, ctx);

    case NodeKind.FIStreamParam:
    case NodeKind.FIOutParam:
      return visit(node.name, ctx);

    case NodeKind.FIFunctionParam:
      return visit(node.name, ctx) || visit(node.iface, ctx);

    case NodeKind.FunctionInterface:
      return visit(node.name, ctx) || visitArray(node.params, visit, ctx) || visit(node.ret, ctx);

    case NodeKind.NativeFunctionDefinition:
      return visit(node.iface, ctx);

    case NodeKind.TreeFunctionDefinition:
      return visit(node.iface, ctx) || visitArray(node.bodyExprs, visit, ctx);

    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
    }
  }
}

// This will always return a node of the same kind, but I can't seem to express this with generics,
// which makes the code way more complicated than it should be, but we ensure type safety.
export function transformChildren<C>(node: Node, transform: (node: Node, ctx: C) => Node, ctx: C): Node {
  const xName = (n: NameNode): NameNode => {
    const tn = transform(n, ctx);
    if (tn.kind !== NodeKind.Name) {
      throw new Error();
    }
    return tn;
  };

  const xIface = (n: FunctionInterfaceNode): FunctionInterfaceNode => {
    const tn = transform(n, ctx);
    if (tn.kind !== NodeKind.FunctionInterface) {
      throw new Error();
    }
    return tn;
  };

  const xAppArgs = (args: ApplicationArgs): ApplicationArgs => {
    let changed = false;
    const newArgs: Map<string, ApplicationArgNode> = new Map();
    args.forEach((value, key) => {
      const nval = transform(value, ctx);
      if (!isApplicationArgNode(nval)) {
        throw new Error();
      }
      if (nval !== value) {
        changed = true;
      }
      newArgs.set(key, nval);
      return nval;
    });
    return changed ? newArgs : args;
  };

  const xStreamExpr = (n: StreamExpressionNode): StreamExpressionNode => {
    const tn = transform(n, ctx);
    if (!isStreamExpressionNode(tn)) {
      throw new Error();
    }
    return tn;
  };

  const xBodyExprArr = (arr: ReadonlyArray<BodyExpressionNode>): ReadonlyArray<BodyExpressionNode> => {
    let changed = false;
    const newArr = arr.map(el => {
      const nel = transform(el, ctx);
      if (!isBodyExpressionNode(nel)) {
        throw new Error();
      }
      if (nel !== el) {
        changed = true;
      }
      return nel;
    });
    return changed ? newArr : arr;
  };

  const xParams = (arr: ReadonlyArray<FIParamNode>): ReadonlyArray<FIParamNode> => {
    let changed = false;
    const newArr = arr.map(el => {
      const nel = transform(el, ctx);
      if (!isFIParamNode(nel)) {
        throw new Error();
      }
      if (nel !== el) {
        changed = true;
      }
      return nel;
    });
    return changed ? newArr : arr;
  };

  const xRet = (n: FIReturnNode | FIVoidNode): FIReturnNode | FIVoidNode => {
    const tn = transform(n, ctx);
    if ((tn.kind !== NodeKind.FIReturn) && (tn.kind !== NodeKind.FIVoid)) {
      throw new Error();
    }
    return tn;
  };

  switch (node.kind) {
    case NodeKind.Name:
    case NodeKind.ApplicationOut:
    case NodeKind.UndefinedLiteral:
    case NodeKind.NumberLiteral:
    case NodeKind.TextLiteral:
    case NodeKind.BooleanLiteral:
    case NodeKind.StreamReference:
    case NodeKind.FIReturn:
    case NodeKind.FIVoid:
      // no children to transform
      return node;

    case NodeKind.Application: {
      const newArgs = xAppArgs(node.args);
      if (newArgs === node.args) {
        return node;
      } else {
        return {
          ...node,
          args: newArgs,
        };
      }
    }

    case NodeKind.YieldExpression: {
      const newExpr = xStreamExpr(node.expr);
      if (newExpr === node.expr) {
        return node;
      } else {
        return {
          ...node,
          expr: newExpr,
        };
      }
    }

    case NodeKind.FIStreamParam:
    case NodeKind.FIOutParam: {
      const newName = xName(node.name);
      if (newName === node.name) {
        return node;
      } else {
        return {
          ...node,
          name: newName,
        };
      }
    }

    case NodeKind.FIFunctionParam: {
      const newName = xName(node.name);
      const newIface = xIface(node.iface);
      if ((newName === node.name) && (newIface === node.iface)) {
        return node;
      } else {
        return {
          ...node,
          name: newName,
          iface: newIface,
        };
      }
    }

    case NodeKind.FunctionInterface: {
      const newName = xName(node.name);
      const newParams = xParams(node.params);
      const newRet = xRet(node.ret);
      if ((newName === node.name) && (newParams === node.params) && (newRet === node.ret)) {
        return node;
      } else {
        return {
          ...node,
          name: newName,
          params: newParams,
          ret: newRet,
        };
      }
    }

    case NodeKind.NativeFunctionDefinition: {
      const newIface = xIface(node.iface);
      if (newIface === node.iface) {
        return node;
      } else {
        return {
          ...node,
          iface: newIface,
        };
      }
    }

    case NodeKind.TreeFunctionDefinition: {
      const newIface = xIface(node.iface);
      const newExprs = xBodyExprArr(node.bodyExprs);
      if ((newIface === node.iface) && (newExprs === node.bodyExprs)) {
        return node;
      } else {
        return {
          ...node,
          iface: newIface,
          bodyExprs: newExprs,
        };
      }
    }

    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
      throw new Error();
    }
  }
}

export function replaceChild(node: Node, oldChild: Node, newChild: Node): Node {
  const replaceName = (n: NameNode): NameNode => {
    if (n === oldChild) {
      if (newChild.kind !== NodeKind.Name) {
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

  const replaceAppArgs = (args: ApplicationArgs): ApplicationArgs => {
    const newArgs: Map<string, ApplicationArgNode> = new Map();
    args.forEach((n, key) => {
      if (n === oldChild) {
        if (!isApplicationArgNode(newChild)) {
          throw new Error();
        }
        newArgs.set(key, newChild);
      } else {
        newArgs.set(key, n);
      }
    });
    return newArgs;
  };

  const replaceIface = (n: FunctionInterfaceNode): FunctionInterfaceNode => {
    if (n === oldChild) {
      if (newChild.kind !== NodeKind.FunctionInterface) {
        throw new Error();
      }
      return newChild;
    } else {
      return n;
    }
  };

  const replaceFIRet = (n: FIReturnNode | FIVoidNode): FIReturnNode | FIVoidNode => {
    if (n === oldChild) {
      if ((newChild.kind !== NodeKind.FIReturn) && (newChild.kind !== NodeKind.FIVoid)) {
        throw new Error();
      }
      return newChild;
    } else {
      return n;
    }
  };

  const replaceParams = (arr: ReadonlyArray<FIParamNode>): ReadonlyArray<FIParamNode> => {
    return arr.map(n => {
      if (n === oldChild) {
        if (!isFIParamNode(newChild)) {
          throw new Error();
        }
        return newChild;
      } else {
        return n;
      }
    });
  };

  switch (node.kind) {
    case NodeKind.Name:
    case NodeKind.ApplicationOut:
    case NodeKind.UndefinedLiteral:
    case NodeKind.NumberLiteral:
    case NodeKind.TextLiteral:
    case NodeKind.BooleanLiteral:
    case NodeKind.StreamReference:
    case NodeKind.FIReturn:
    case NodeKind.FIVoid:
      throw new Error('no children to replace');

    case NodeKind.Application:
      return {
        ...node,
        args: replaceAppArgs(node.args),
      };

    case NodeKind.YieldExpression:
      return {
        ...node,
        expr: replaceStreamExpr(node.expr),
      };

    case NodeKind.FIStreamParam:
    case NodeKind.FIOutParam:
      return {
        ...node,
        name: replaceName(node.name),
      };

    case NodeKind.FIFunctionParam:
      return {
        ...node,
        name: replaceName(node.name),
        iface: replaceIface(node.iface),
      };

    case NodeKind.FunctionInterface:
      return {
        ...node,
        name: replaceName(node.name),
        params: replaceParams(node.params),
        ret: replaceFIRet(node.ret),
      };

    case NodeKind.NativeFunctionDefinition:
      return {
        ...node,
        iface: replaceIface(node.iface),
      };

    case NodeKind.TreeFunctionDefinition:
      return {
        ...node,
        iface: replaceIface(node.iface),
        bodyExprs: replaceBodyExprArr(node.bodyExprs),
      };

    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
      throw new Error(); // should be unreachable
    }
  }
}
