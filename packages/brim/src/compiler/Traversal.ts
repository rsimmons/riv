import { NodeKind, Node, StreamExpressionNode, isStreamExpressionNode, FunctionInterfaceNode, ApplicationArgs, BindingExpressionNode, isBindingExpressionNode, isTreeImplBodyNode, TreeImplBodyNode, FunctionImplNode, isFunctionImplNode, ParamNode, TextNode } from './Tree';

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
    case NodeKind.Text:
    case NodeKind.UndefinedLiteral:
    case NodeKind.NumberLiteral:
    case NodeKind.TextLiteral:
    case NodeKind.BooleanLiteral:
    case NodeKind.StreamReference:
      // no children
      break;

    case NodeKind.Application:
      yield* node.args.values();
      break;

    case NodeKind.NameBinding:
      yield node.name;
      break;

    case NodeKind.Param:
      yield node.name;
      if (node.type) {
        yield node.type;
      }
      break;

    case NodeKind.FunctionInterface:
      yield node.name;
      yield* node.params;
      break;

    case NodeKind.NativeImpl:
      // no children
      break;

    case NodeKind.StreamBinding:
      yield node.bexpr;
      yield node.sexpr;
      break;

    case NodeKind.TreeImpl:
      yield* node.body;
      if (node.out) {
        yield node.out;
      }
      break;

    case NodeKind.FunctionDefinition:
      yield node.iface;
      yield node.impl;
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
    case NodeKind.Text:
    case NodeKind.UndefinedLiteral:
    case NodeKind.NumberLiteral:
    case NodeKind.TextLiteral:
    case NodeKind.BooleanLiteral:
    case NodeKind.StreamReference:
      // no children
      return;

    case NodeKind.Application:
      return visitArray([...node.args.values()], visit, ctx);

    case NodeKind.NameBinding:
      return visit(node.name, ctx);

    case NodeKind.Param:
      return visit(node.name, ctx) || (node.type ? visit(node.type, ctx) : undefined)

    case NodeKind.FunctionInterface:
      return visit(node.name, ctx) || visitArray(node.params, visit, ctx);

    case NodeKind.NativeImpl:
      // no children
      return;

    case NodeKind.StreamBinding:
      return visit(node.bexpr, ctx) || visit(node.sexpr, ctx);

    case NodeKind.TreeImpl:
      return visitArray(node.body, visit, ctx) || (node.out ? visit(node.out, ctx) : undefined);

    case NodeKind.FunctionDefinition:
      return visit(node.iface, ctx) || visit(node.impl, ctx);

    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
    }
  }
}

// This will always return a node of the same kind, but I can't seem to express this with generics,
// which makes the code way more complicated than it should be, but we ensure type safety.
export function transformChildren<C>(node: Node, transform: (node: Node, ctx: C) => Node, ctx: C): Node {
  const xText = (n: TextNode): TextNode => {
    const tn = transform(n, ctx);
    if (tn.kind !== NodeKind.Text) {
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
    const newArgs: Map<string, StreamExpressionNode> = new Map();
    args.forEach((value, key) => {
      const nval = transform(value, ctx);
      if (!isStreamExpressionNode(nval)) {
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

  const xBindingExpr = (n: BindingExpressionNode): BindingExpressionNode => {
    const tn = transform(n, ctx);
    if (!isBindingExpressionNode(tn)) {
      throw new Error();
    }
    return tn;
  };

  const xTreeImplBodyArr = (arr: ReadonlyArray<TreeImplBodyNode>): ReadonlyArray<TreeImplBodyNode> => {
    let changed = false;
    const newArr = arr.map(el => {
      const nel = transform(el, ctx);
      if (!isTreeImplBodyNode(nel)) {
        throw new Error();
      }
      if (nel !== el) {
        changed = true;
      }
      return nel;
    });
    return changed ? newArr : arr;
  };

  const xParams = (arr: ReadonlyArray<ParamNode>): ReadonlyArray<ParamNode> => {
    let changed = false;
    const newArr = arr.map(el => {
      const nel = transform(el, ctx);
      if (nel.kind !== NodeKind.Param) {
        throw new Error();
      }
      if (nel !== el) {
        changed = true;
      }
      return nel;
    });
    return changed ? newArr : arr;
  };

  const xImpl = (n: FunctionImplNode): FunctionImplNode => {
    const tn = transform(n, ctx);
    if (!isFunctionImplNode(tn)) {
      throw new Error();
    }
    return tn;
  }

  switch (node.kind) {
    case NodeKind.Text:
    case NodeKind.UndefinedLiteral:
    case NodeKind.NumberLiteral:
    case NodeKind.TextLiteral:
    case NodeKind.BooleanLiteral:
    case NodeKind.StreamReference:
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

    case NodeKind.NameBinding:
      const newName = xText(node.name);
      if (newName === node.name) {
        return node;
      } else {
        return {
          ...node,
          name: newName,
        };
      }

    case NodeKind.Param: {
      const newName = xText(node.name);
      const newType = node.type ? xIface(node.type) : null;
      if ((newName === node.name) && (newType === node.type)) {
        return node;
      } else {
        return {
          ...node,
          name: newName,
          type: newType,
        };
      }
    }

    case NodeKind.FunctionInterface: {
      const newName = xText(node.name);
      const newParams = xParams(node.params);
      if ((newName === node.name) && (newParams === node.params)) {
        return node;
      } else {
        return {
          ...node,
          name: newName,
          params: newParams,
        };
      }
    }

    case NodeKind.NativeImpl:
      // no children
      return node;

    case NodeKind.StreamBinding: {
      const newBexpr = xBindingExpr(node.bexpr);
      const newSexpr = xStreamExpr(node.sexpr);
      if ((newBexpr === node.bexpr) && (newSexpr === node.sexpr)) {
        return node;
      } else {
        return {
          ...node,
          bexpr: newBexpr,
          sexpr: newSexpr,
        };
      }
    }

    case NodeKind.TreeImpl: {
      const newBody = xTreeImplBodyArr(node.body);
      const newOut = node.out ? xStreamExpr(node.out) : null;
      if ((newBody === node.body) && (newOut === node.out)) {
        return node;
      } else {
        return {
          ...node,
          body: newBody,
          out: newOut,
        };
      }
    }

    case NodeKind.FunctionDefinition: {
      const newIface = xIface(node.iface);
      const newImpl = xImpl(node.impl);
      if ((newIface === node.iface) && (newImpl === node.impl)) {
        return node;
      } else {
        return {
          ...node,
          iface: newIface,
          impl: newImpl,
        }
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
  const replaceText = (n: TextNode): TextNode => {
    if (n === oldChild) {
      if (newChild.kind !== NodeKind.Text) {
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

  const replaceBindExpr = (n: BindingExpressionNode): BindingExpressionNode => {
    if (n === oldChild) {
      if (!isBindingExpressionNode(newChild)) {
        throw new Error();
      }
      return newChild;
    } else {
      return n;
    }
  };

  const replaceImpl = (n: FunctionImplNode): FunctionImplNode => {
    if (n === oldChild) {
      if (!isFunctionImplNode(newChild)) {
        throw new Error();
      }
      return newChild;
    } else {
      return n;
    }
  };

  const replaceTreeImplBodyArr = (arr: ReadonlyArray<TreeImplBodyNode>): ReadonlyArray<TreeImplBodyNode> => {
    return arr.map((n: TreeImplBodyNode) => {
      if (n === oldChild) {
        if (!isTreeImplBodyNode(newChild)) {
          throw new Error();
        }
        return newChild;
      } else {
        return n;
      }
    });
  };

  const replaceAppArgs = (args: ApplicationArgs): ApplicationArgs => {
    const newArgs: Map<string, StreamExpressionNode> = new Map();
    args.forEach((n, key) => {
      if (n === oldChild) {
        if (!isStreamExpressionNode(newChild)) {
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

  const replaceParams = (arr: ReadonlyArray<ParamNode>): ReadonlyArray<ParamNode> => {
    return arr.map(n => {
      if (n === oldChild) {
        if (newChild.kind !== NodeKind.Param) {
          throw new Error();
        }
        return newChild;
      } else {
        return n;
      }
    });
  };

  switch (node.kind) {
    case NodeKind.Text:
    case NodeKind.UndefinedLiteral:
    case NodeKind.NumberLiteral:
    case NodeKind.TextLiteral:
    case NodeKind.BooleanLiteral:
    case NodeKind.StreamReference:
      throw new Error('no children to replace');

    case NodeKind.Application:
      return {
        ...node,
        args: replaceAppArgs(node.args),
      };

    case NodeKind.NameBinding:
      return {
        ...node,
        name: replaceText(node.name),
      }

    case NodeKind.Param:
      return {
        ...node,
        name: replaceText(node.name),
        type: node.type ? replaceIface(node.type) : null,
      };

    case NodeKind.FunctionInterface:
      return {
        ...node,
        name: replaceText(node.name),
        params: replaceParams(node.params),
      };

    case NodeKind.NativeImpl:
      throw new Error('no children to replace');

    case NodeKind.StreamBinding:
      return {
        ...node,
        bexpr: replaceBindExpr(node.bexpr),
        sexpr: replaceStreamExpr(node.sexpr),
      };

    case NodeKind.TreeImpl:
      return {
        ...node,
        body: replaceTreeImplBodyArr(node.body),
        out: node.out ? replaceStreamExpr(node.out) : null,
      };

    case NodeKind.FunctionDefinition:
      return {
        ...node,
        iface: replaceIface(node.iface),
        impl: replaceImpl(node.impl),
      }

    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
      throw new Error(); // should be unreachable
    }
  }
}
