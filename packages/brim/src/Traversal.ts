// import { Path, pathIsPrefix } from './State';
import { NodeKind, Node, NameNode, StreamExpressionNode, isStreamExpressionNode, BodyExpressionNode, isBodyExpressionNode, ApplicationOut, FunctionDefinitionNode, isFunctionDefinitionNode, FunctionInterfaceNode, isFunctionInterfaceNode, StaticFunctionInterfaceNode, FIOutNode, FITmplSegNode, isFITmplSegNode, FINothingNode } from './Tree';

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
    case NodeKind.UndefinedLiteral:
    case NodeKind.NumberLiteral:
    case NodeKind.TextLiteral:
    case NodeKind.BooleanLiteral:
    case NodeKind.StreamReference:
    case NodeKind.FIText:
    case NodeKind.FIBreak:
    case NodeKind.FINothing:
      // no children
      break;

    case NodeKind.Application:
      for (const out of node.outs) {
        if (out.name) {
          yield out.name;
        }
      }
      yield* node.sargs;
      yield* node.fargs;
      break;

    case NodeKind.YieldExpression:
      yield node.expr;
      break;

    case NodeKind.FIStreamParam:
    case NodeKind.FIOut:
      yield node.name;
      break;

    case NodeKind.FIFunctionParam:
      yield node.iface;
      break;

    case NodeKind.StaticFunctionInterface:
      yield* node.segs;
      if (node.ret) {
        yield node.ret;
      }
      break;

    case NodeKind.DynamicFunctionInterface:
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

function visitOuts<N, C>(outs: ReadonlyArray<ApplicationOut>, visit: (node: Node, ctx: C) => N | undefined, ctx: C): N | undefined {
  for (const out of outs) {
    if (out.name) {
      const result = visit(out.name, ctx);
      if (result) {
        return result;
      }
    }
  }
}

/**
 * Note that this aborts if the visit function returns a truthy value.
 */
export function visitChildren<N, C>(node: Node, visit: (node: Node, ctx: C) => N | undefined, ctx: C): N | undefined {
  switch (node.kind) {
    case NodeKind.Name:
    case NodeKind.UndefinedLiteral:
    case NodeKind.NumberLiteral:
    case NodeKind.TextLiteral:
    case NodeKind.BooleanLiteral:
    case NodeKind.StreamReference:
    case NodeKind.FIText:
    case NodeKind.FIBreak:
    case NodeKind.FINothing:
      // no children
      return;

    case NodeKind.Application:
      return visitOuts(node.outs, visit, ctx) || visitArray(node.sargs, visit, ctx) || visitArray(node.fargs, visit, ctx);

    case NodeKind.YieldExpression:
      return visit(node.expr, ctx);

    case NodeKind.FIStreamParam:
    case NodeKind.FIOut:
      return visit(node.name, ctx);

    case NodeKind.FIFunctionParam:
      return visit(node.iface, ctx);

    case NodeKind.StaticFunctionInterface:
      return visitArray(node.segs, visit, ctx) || (node.ret ? visit(node.ret, ctx) : undefined);

    case NodeKind.DynamicFunctionInterface:
      return;

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
    if (!isFunctionInterfaceNode(tn)) {
      throw new Error();
    }
    return tn;
  };

  const xStaticIface = (n: StaticFunctionInterfaceNode): StaticFunctionInterfaceNode => {
    const tn = transform(n, ctx);
    if (tn.kind !== NodeKind.StaticFunctionInterface) {
      throw new Error();
    }
    return tn;
  };

  const xOuts = (outs: ReadonlyArray<ApplicationOut>): ReadonlyArray<ApplicationOut> => {
    let changed = false;
    const newOuts = outs.map(out => {
      if (out.name) {
        const newName = transform(out.name, ctx);
        if (newName.kind !== NodeKind.Name) {
          throw new Error();
        }
        if (newName !== out.name) {
          changed = true;
        }
        return {
          ...out,
          name: newName,
        };
      } else {
        return out;
      }
    });
    return changed ? newOuts : outs;
  };

  const xStreamExpr = (n: StreamExpressionNode): StreamExpressionNode => {
    const tn = transform(n, ctx);
    if (!isStreamExpressionNode(tn)) {
      throw new Error();
    }
    return tn;
  };

  const xStreamExprArr = (arr: ReadonlyArray<StreamExpressionNode>): ReadonlyArray<StreamExpressionNode> => {
    let changed = false;
    const newArr = arr.map(el => {
      const nel = transform(el, ctx);
      if (!isStreamExpressionNode(nel)) {
        throw new Error();
      }
      if (nel !== el) {
        changed = true;
      }
      return nel;
    });
    return changed ? newArr : arr;
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

  const xFuncDefArr = (arr: ReadonlyArray<FunctionDefinitionNode>): ReadonlyArray<FunctionDefinitionNode> => {
    let changed = false;
    const newArr = arr.map(el => {
      const nel = transform(el, ctx);
      if (!isFunctionDefinitionNode(nel)) {
        throw new Error();
      }
      if (nel !== el) {
        changed = true;
      }
      return nel;
    });
    return changed ? newArr : arr;
  };

  const xTmplSegArr = (arr: ReadonlyArray<FITmplSegNode>): ReadonlyArray<FITmplSegNode> => {
    let changed = false;
    const newArr = arr.map(el => {
      const nel = transform(el, ctx);
      if (!isFITmplSegNode(nel)) {
        throw new Error();
      }
      if (nel !== el) {
        changed = true;
      }
      return nel;
    });
    return changed ? newArr : arr;
  };

  const xRet = (n: FIOutNode | FINothingNode): FIOutNode | FINothingNode => {
    const tn = transform(n, ctx);
    if ((tn.kind !== NodeKind.FIOut) && (tn.kind !== NodeKind.FINothing)) {
      throw new Error();
    }
    return tn;
  };

  switch (node.kind) {
    case NodeKind.Name:
    case NodeKind.UndefinedLiteral:
    case NodeKind.NumberLiteral:
    case NodeKind.TextLiteral:
    case NodeKind.BooleanLiteral:
    case NodeKind.StreamReference:
    case NodeKind.FIText:
    case NodeKind.FIBreak:
    case NodeKind.FINothing:
      // no children to transform
      return node;

    case NodeKind.Application: {
      const newOuts = xOuts(node.outs);
      const newSargs = xStreamExprArr(node.sargs);
      const newFargs = xFuncDefArr(node.fargs);
      if ((newOuts === node.outs) && (newSargs === node.sargs) && (newFargs === node.fargs)) {
        return node;
      } else {
        return {
          ...node,
          outs: newOuts,
          sargs: newSargs,
          fargs: newFargs,
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
    case NodeKind.FIOut:
      const newName = xName(node.name);
      if (newName === node.name) {
        return node;
      } else {
        return {
          ...node,
          name: newName,
        };
      }

    case NodeKind.FIFunctionParam:
      const newIface = xStaticIface(node.iface);
      if (newIface === node.iface) {
        return node;
      } else {
        return {
          ...node,
          iface: newIface,
        };
      }

    case NodeKind.StaticFunctionInterface:
      const newSegs = xTmplSegArr(node.segs);
      const newRet = xRet(node.ret);
      if ((newSegs === node.segs) && (newRet === node.ret)) {
        return node;
      } else {
        return {
          ...node,
          segs: newSegs,
          ret: newRet,
        };
      }

    case NodeKind.DynamicFunctionInterface:
      return node;

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

  const replaceOuts = (outs: ReadonlyArray<ApplicationOut>): ReadonlyArray<ApplicationOut> => {
    return outs.map((out: ApplicationOut) => {
      if (out.name === oldChild) {
        if (newChild.kind !== NodeKind.Name) {
          throw new Error();
        }
        return {
          ...out,
          name: newChild,
        };
      } else {
        return out;
      }
    });
  };

  const replaceFuncDefArr = (arr: ReadonlyArray<FunctionDefinitionNode>): ReadonlyArray<FunctionDefinitionNode> => {
    return arr.map((n: FunctionDefinitionNode) => {
      if (n === oldChild) {
        if (!isFunctionDefinitionNode(newChild)) {
          throw new Error();
        }
        return newChild;
      } else {
        return n;
      }
    });
  };

  const replaceStaticIface = (n: StaticFunctionInterfaceNode): StaticFunctionInterfaceNode => {
    if (n === oldChild) {
      if (newChild.kind !== NodeKind.StaticFunctionInterface) {
        throw new Error();
      }
      return newChild;
    } else {
      return n;
    }
  };

  const replaceIface = (n: FunctionInterfaceNode): FunctionInterfaceNode => {
    if (n === oldChild) {
      if (!isFunctionInterfaceNode(newChild)) {
        throw new Error();
      }
      return newChild;
    } else {
      return n;
    }
  };

  const replaceFIRet = (n: FIOutNode | FINothingNode): FIOutNode | FINothingNode => {
    if (n === oldChild) {
      if ((newChild.kind !== NodeKind.FIOut) && (newChild.kind !== NodeKind.FINothing)) {
        throw new Error();
      }
      return newChild;
    } else {
      return n;
    }
  };

  const replaceTmplSegArr = (arr: ReadonlyArray<FITmplSegNode>): ReadonlyArray<FITmplSegNode> => {
    return arr.map((n: FITmplSegNode) => {
      if (n === oldChild) {
        if (!isFITmplSegNode(newChild)) {
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
    case NodeKind.UndefinedLiteral:
    case NodeKind.NumberLiteral:
    case NodeKind.TextLiteral:
    case NodeKind.BooleanLiteral:
    case NodeKind.StreamReference:
    case NodeKind.FIText:
    case NodeKind.FIBreak:
    case NodeKind.FINothing:
      throw new Error('no children to replace');

    case NodeKind.Application:
      return {
        ...node,
        outs: replaceOuts(node.outs),
        sargs: replaceStreamExprArr(node.sargs),
        fargs: replaceFuncDefArr(node.fargs),
      };

    case NodeKind.YieldExpression:
      return {
        ...node,
        expr: replaceStreamExpr(node.expr),
      };

    case NodeKind.FIStreamParam:
    case NodeKind.FIOut:
      return {
        ...node,
        name: replaceName(node.name),
      };

    case NodeKind.FIFunctionParam:
      return {
        ...node,
        iface: replaceStaticIface(node.iface),
      };

    case NodeKind.StaticFunctionInterface:
      return {
        ...node,
        segs: replaceTmplSegArr(node.segs),
        ret: replaceFIRet(node.ret),
      };

    case NodeKind.DynamicFunctionInterface:
      throw new Error('no children to replace');

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
