// import { Path, pathIsPrefix } from './State';
import { NodeKind, Node, SignatureNode, NameNode, StreamExpressionNode, isStreamExpressionNode, BodyExpressionNode, isBodyExpressionNode, TreeFunctionBodyNode, FunctionExpressionNode, isFunctionExpressionNode, ApplicationOut, StreamParameterNode, FunctionParameterNode } from './Tree';

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
    case NodeKind.Name:
    case NodeKind.UndefinedLiteral:
    case NodeKind.NumberLiteral:
    case NodeKind.TextLiteral:
    case NodeKind.BooleanLiteral:
    case NodeKind.StreamReference:
    case NodeKind.FunctionReference:
      // no children
      break;

    case NodeKind.SignatureStreamParameter:
    case NodeKind.SignatureFunctionParameter:
    case NodeKind.SignatureYield:
      // no children
      break;

    case NodeKind.ArrayLiteral:
      yield* node.elems;
      break;

    case NodeKind.Application:
      yield node.func;
      for (const out of node.outs) {
        if (out.name) {
          yield out.name;
        }
      }
      yield* node.sargs;
      yield* node.fargs;
      break;

    case NodeKind.Signature:
      yield* node.streamParams;
      yield* node.funcParams;
      yield* node.yields;
      break;

    case NodeKind.StreamParameter:
    case NodeKind.FunctionParameter:
      yield node.name;
      break;

    case NodeKind.YieldExpression:
      yield node.expr;
      break;

    case NodeKind.TreeFunctionBody:
      yield* node.exprs;
      break;

    case NodeKind.TreeFunctionDefinition:
      yield node.sig;
      yield* node.sparams;
      yield* node.fparams;
      yield node.body;
      break;

    case NodeKind.NativeFunctionDefinition:
      yield node.sig;
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
    case NodeKind.FunctionReference:
      // no children
      return;

    case NodeKind.SignatureStreamParameter:
    case NodeKind.SignatureFunctionParameter:
    case NodeKind.SignatureYield:
      // no children
      return;

    case NodeKind.ArrayLiteral:
      return visitArray(node.elems, visit, ctx);

    case NodeKind.Application:
      return visit(node.func, ctx) || visitOuts(node.outs, visit, ctx) || visitArray(node.sargs, visit, ctx) || visitArray(node.fargs, visit, ctx);

    case NodeKind.Signature:
      return visitArray(node.streamParams, visit, ctx) || visitArray(node.funcParams, visit, ctx) || visitArray(node.yields, visit, ctx);

    case NodeKind.StreamParameter:
    case NodeKind.FunctionParameter:
      return visit(node.name, ctx);

    case NodeKind.YieldExpression:
      return visit(node.name, ctx) || visit(node.expr, ctx);

    case NodeKind.TreeFunctionBody:
      return visitArray(node.exprs, visit, ctx);

    case NodeKind.TreeFunctionDefinition:
      return visit(node.sig, ctx) || visitArray(node.sparams, visit, ctx) || visitArray(node.fparams, visit, ctx) || visit(node.body, ctx);

    case NodeKind.NativeFunctionDefinition:
      return visit(node.sig, ctx);

    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
    }
  }
}

// This will always return a node of the same kind, but I can't seem to express this with generics,
// which makes the code way more complicated than it should be, but we ensure type safety.
export function transformChildren<T>(node: Node, transform: (node: Node, ctx: T) => Node, ctx: T): Node {
  const xName = (n: NameNode): NameNode => {
    const tn = transform(n, ctx);
    if (tn.kind !== NodeKind.Name) {
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

  const xStreamParamArr = (arr: ReadonlyArray<StreamParameterNode>): ReadonlyArray<StreamParameterNode> => {
    let changed = false;
    const newArr = arr.map(el => {
      const nel = transform(el, ctx);
      if (nel.kind !== NodeKind.StreamParameter) {
        throw new Error();
      }
      if (nel !== el) {
        changed = true;
      }
      return nel;
    });
    return changed ? newArr : arr;
  };

  const xFunctionParamArr = (arr: ReadonlyArray<FunctionParameterNode>): ReadonlyArray<FunctionParameterNode> => {
    let changed = false;
    const newArr = arr.map(el => {
      const nel = transform(el, ctx);
      if (nel.kind !== NodeKind.FunctionParameter) {
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

  const xFuncExpr = (n: FunctionExpressionNode): FunctionExpressionNode => {
    const tn = transform(n, ctx);
    if (!isFunctionExpressionNode(tn)) {
      throw new Error();
    }
    return tn;
  };

  const xFuncExprArr = (arr: ReadonlyArray<FunctionExpressionNode>): ReadonlyArray<FunctionExpressionNode> => {
    let changed = false;
    const newArr = arr.map(el => {
      const nel = transform(el, ctx);
      if (!isFunctionExpressionNode(nel)) {
        throw new Error();
      }
      if (nel !== el) {
        changed = true;
      }
      return nel;
    });
    return changed ? newArr : arr;
  };

  const xSignature = (n: SignatureNode): SignatureNode => {
    const tn = transform(n, ctx);
    if (tn.kind !== NodeKind.Signature) {
      throw new Error();
    }
    return tn;
  };

  const xTreeBody = (n: TreeFunctionBodyNode): TreeFunctionBodyNode => {
    const tn = transform(n, ctx);
    if (tn.kind !== NodeKind.TreeFunctionBody) {
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
    case NodeKind.FunctionReference:
      // no children to transform
      return node;

    case NodeKind.SignatureStreamParameter:
    case NodeKind.SignatureFunctionParameter:
    case NodeKind.SignatureYield:
      // no children to transform
      return node;

    case NodeKind.ArrayLiteral:
      const newElems = xStreamExprArr(node.elems);
      if (newElems === node.elems) {
        return node;
      } else {
        return {
          ...node,
          elems: newElems,
        };
      }

    case NodeKind.Application: {
      const newFunc = xFuncExpr(node.func);
      const newOuts = xOuts(node.outs);
      const newSargs = xStreamExprArr(node.sargs);
      const newFargs = xFuncExprArr(node.fargs);
      if ((newFunc === node.func) && (newOuts === node.outs) && (newSargs === node.sargs) && (newFargs === node.fargs)) {
        return node;
      } else {
        return {
          ...node,
          func: newFunc,
          outs: newOuts,
          sargs: newSargs,
          fargs: newFargs,
        };
      }
    }

    case NodeKind.Signature:
      // TODO: implement
      return node;

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

    case NodeKind.StreamParameter:
    case NodeKind.FunctionParameter:
      const newName = xName(node.name);
      if (newName === node.name) {
        return node;
      } else {
        return {
          ...node,
          name: newName,
        };
      }

    case NodeKind.TreeFunctionBody: {
      const newExprs = xBodyExprArr(node.exprs);
      if (newExprs === node.exprs) {
        return node;
      } else {
        return {
          ...node,
          exprs: newExprs,
        };
      }
    }

    case NodeKind.TreeFunctionDefinition: {
      const newSig = xSignature(node.sig);
      const newSparams = xStreamParamArr(node.sparams);
      const newFparams = xFunctionParamArr(node.fparams);
      const newBody = xTreeBody(node.body);
      if ((newSig === node.sig) && (newSparams === node.sparams) && (newFparams === node.fparams) && (newBody === node.body)) {
        return node;
      } else {
        return {
          ...node,
          sig: newSig,
          sparams: newSparams,
          fparams: newFparams,
          body: newBody,
        };
      }
    }

    case NodeKind.NativeFunctionDefinition: {
      const newSig = xSignature(node.sig);
      if (newSig === node.sig) {
        return node;
      } else {
        return {
          ...node,
          sig: newSig,
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

  const replaceFuncExprArr = (arr: ReadonlyArray<FunctionExpressionNode>): ReadonlyArray<FunctionExpressionNode> => {
    return arr.map((n: FunctionExpressionNode) => {
      if (n === oldChild) {
        if (!isFunctionExpressionNode(newChild)) {
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

  switch (node.kind) {
    case NodeKind.Name:
    case NodeKind.UndefinedLiteral:
    case NodeKind.NumberLiteral:
    case NodeKind.TextLiteral:
    case NodeKind.BooleanLiteral:
    case NodeKind.StreamReference:
    case NodeKind.FunctionReference:
      throw new Error('no children to replace');

    case NodeKind.SignatureStreamParameter:
    case NodeKind.SignatureFunctionParameter:
    case NodeKind.SignatureYield:
      throw new Error('no children to replace');

    case NodeKind.ArrayLiteral:
      return {
        ...node,
        elems: replaceStreamExprArr(node.elems),
      };

    case NodeKind.Application:
      return {
        ...node,
        func: replaceFunctionExpression(node.func),
        outs: replaceOuts(node.outs),
        sargs: replaceStreamExprArr(node.sargs),
        fargs: replaceFuncExprArr(node.fargs),
      };

    case NodeKind.Signature:
      return {
        ...node,
        // TODO: members
      };

    case NodeKind.StreamParameter:
    case NodeKind.FunctionParameter:
      return {
        ...node,
        name: replaceName(node.name),
      };

    case NodeKind.YieldExpression:
      return {
        ...node,
        expr: replaceStreamExpr(node.expr),
      };

    case NodeKind.TreeFunctionBody:
      return {
        ...node,
        exprs: replaceBodyExprArr(node.exprs),
      };

    case NodeKind.TreeFunctionDefinition:
      return {
        ...node,
        sig: replaceSignature(node.sig),
        body: replaceTreeBody(node.body),
      };

    case NodeKind.NativeFunctionDefinition:
      return {
        ...node,
        sig: replaceSignature(node.sig),
      };

    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
      throw new Error(); // should be unreachable
    }
  }
}
