// import { Path, pathIsPrefix } from './State';
import { NodeKind, Node, SignatureNode, DescriptionNode, StreamExpressionNode, isStreamExpressionNode, BodyExpressionNode, isBodyExpressionNode, TreeFunctionBodyNode, FunctionExpressionNode, isFunctionExpressionNode, ApplicationNode, DescribedStreamID } from './Tree';

export function firstChild(node: Node): Node | undefined {
  const res = iterChildren(node).next();
  return res.done ? undefined : res.value;
}

export function lastChild(node: Node): Node | undefined {
  const children = [...iterChildren(node)];
  return children.pop();
}

function appDescs(node: ApplicationNode) {
  const result = [];
  for (const dsid of node.dsids) {
    if (dsid.desc) {
      result.push(dsid.desc);
    }
  }
  return result;
}

export function* iterChildren(node: Node) {
  switch (node.kind) {
    case NodeKind.StreamReference:
    case NodeKind.FunctionReference:
    case NodeKind.Description:
      // no children
      break;

    case NodeKind.UndefinedLiteral:
    case NodeKind.NumberLiteral:
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
      yield* appDescs(node);
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
    case NodeKind.StreamReference:
    case NodeKind.FunctionReference:
      // no children
      return;

    case NodeKind.UndefinedLiteral:
    case NodeKind.NumberLiteral:
    case NodeKind.SignatureStreamParameter:
    case NodeKind.SignatureFunctionParameter:
    case NodeKind.SignatureYield:
      return (node.desc && visit(node.desc));

    case NodeKind.ArrayLiteral:
      return (node.desc && visit(node.desc)) || visitArray(node.elems, visit);

    case NodeKind.Application:
      return visitArray(appDescs(node), visit) || visit(node.func) || visitArray(node.sargs, visit) || visitArray(node.fargs, visit);

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

// This will always return a node of the same kind, but I can't seem to express this with generics,
// which makes the code way more complicated than it should be, but we ensure type safety.
export function transformChildren(node: Node, transform: (node: Node) => Node): Node {
  const xDesc = (n: DescriptionNode): DescriptionNode => {
    const tn = transform(n);
    if (tn.kind !== NodeKind.Description) {
      throw new Error();
    }
    return tn;
  };

  const xDescSids = (dsids: ReadonlyArray<DescribedStreamID>): ReadonlyArray<DescribedStreamID> => {
    let changed = false;
    const newDsids = dsids.map(dsid => {
      const newDesc = dsid.desc && xDesc(dsid.desc);
      if (newDesc !== dsid.desc) {
        changed = true;
        return {
          sid: dsid.sid,
          desc: newDesc,
        };
      } else {
        return dsid;
      }
    });
    return changed ? newDsids : dsids;
  };

  const xStreamExpr = (n: StreamExpressionNode): StreamExpressionNode => {
    const tn = transform(n);
    if (!isStreamExpressionNode(tn)) {
      throw new Error();
    }
    return tn;
  };

  const xStreamExprArr = (arr: ReadonlyArray<StreamExpressionNode>): ReadonlyArray<StreamExpressionNode> => {
    let changed = false;
    const newArr = arr.map(el => {
      const nel = transform(el);
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
      const nel = transform(el);
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
    const tn = transform(n);
    if (!isFunctionExpressionNode(tn)) {
      throw new Error();
    }
    return tn;
  };

  const xFuncExprArr = (arr: ReadonlyArray<FunctionExpressionNode>): ReadonlyArray<FunctionExpressionNode> => {
    let changed = false;
    const newArr = arr.map(el => {
      const nel = transform(el);
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
    const tn = transform(n);
    if (tn.kind !== NodeKind.Signature) {
      throw new Error();
    }
    return tn;
  };

  const xTreeBody = (n: TreeFunctionBodyNode): TreeFunctionBodyNode => {
    const tn = transform(n);
    if (tn.kind !== NodeKind.TreeFunctionBody) {
      throw new Error();
    }
    return tn;
  };

  switch (node.kind) {
    case NodeKind.Description:
    case NodeKind.StreamReference:
    case NodeKind.FunctionReference:
      // no children to transform
      return node;

    case NodeKind.UndefinedLiteral:
    case NodeKind.NumberLiteral:
    case NodeKind.SignatureStreamParameter:
    case NodeKind.SignatureFunctionParameter:
    case NodeKind.SignatureYield: {
      const newDesc = node.desc && xDesc(node.desc);
      if (newDesc === node.desc) {
        return node;
      } else {
        return {
          ...node,
          desc: newDesc,
        };
      }
    }

    case NodeKind.ArrayLiteral: {
      const newDesc = node.desc && xDesc(node.desc);
      const newElems = xStreamExprArr(node.elems);
      if ((newDesc === node.desc) && (newElems === node.elems)) {
        return node;
      } else {
        return {
          ...node,
          desc: newDesc,
          elems: newElems,
        };
      }
    }

    case NodeKind.Application: {
      const newDescSids = xDescSids(node.dsids);
      const newFunc = xFuncExpr(node.func);
      const newSargs = xStreamExprArr(node.sargs);
      const newFargs = xFuncExprArr(node.fargs);
      if ((newDescSids === node.dsids) && (newFunc === node.func) && (newSargs === node.sargs) && (newFargs === node.fargs)) {
        return node;
      } else {
        return {
          ...node,
          dsids: newDescSids,
          func: newFunc,
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
      const newDesc = node.desc && xDesc(node.desc);
      const newSig = xSignature(node.sig);
      const newBody = xTreeBody(node.body);
      if ((newDesc === node.desc) && (newSig === node.sig) && (newBody === node.body)) {
        return node;
      } else {
        return {
          ...node,
          desc: newDesc,
          sig: newSig,
          body: newBody,
        };
      }
    }

    case NodeKind.NativeFunctionDefinition: {
      const newDesc = node.desc && xDesc(node.desc);
      const newSig = xSignature(node.sig);
      if ((newDesc === node.desc) && (newSig === node.sig)) {
        return node;
      } else {
        return {
          ...node,
          desc: newDesc,
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
  const replaceDesc = (n: DescriptionNode | undefined): DescriptionNode | undefined => {
    if (!n) {
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

  const replaceDescSids = (arr: ReadonlyArray<DescribedStreamID>): ReadonlyArray<DescribedStreamID> => {
    return arr.map(dsid => {
      if (dsid.desc === oldChild) {
        if (newChild.kind !== NodeKind.Description) {
          throw new Error();
        }
        return {
          sid: dsid.sid,
          desc: newChild,
        };
      } else {
        return dsid;
      }
    });
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

  switch (node.kind) {
    case NodeKind.StreamReference:
    case NodeKind.FunctionReference:
    case NodeKind.Description:
      throw new Error('no children to replace');

    case NodeKind.UndefinedLiteral:
    case NodeKind.NumberLiteral:
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
        dsids: replaceDescSids(node.dsids),
        func: replaceFunctionExpression(node.func),
        sargs: replaceStreamExprArr(node.sargs),
        fargs: replaceFuncExprArr(node.fargs),
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
