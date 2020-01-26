import { NodeKind, StreamID, FunctionID, StreamExpressionNode, FunctionExpressionNode, FunctionDefinitionNode } from './Tree';

export function streamExprReturnedId(node: StreamExpressionNode): StreamID | undefined {
  switch (node.kind) {
    case NodeKind.UndefinedLiteral:
    case NodeKind.NumberLiteral:
    case NodeKind.TextLiteral:
    case NodeKind.BooleanLiteral:
    case NodeKind.ArrayLiteral:
      return node.sid;

    case NodeKind.StreamReference:
      return node.ref;

    case NodeKind.Application:
      for (const out of node.outs) {
        if (!out.name) {
          return out.sid;
        }
      }
      return undefined;

    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
      throw new Error();
    }
  }
}

export function functionExprId(node: FunctionExpressionNode): FunctionID {
  switch (node.kind) {
    case NodeKind.FunctionReference:
      return node.ref;

    case NodeKind.TreeFunctionDefinition:
    case NodeKind.NativeFunctionDefinition:
      return node.fid;

    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
      throw new Error();
    }
  }
}

export function functionReturnedIndex(def: FunctionDefinitionNode): number | undefined {
  const boundYieldIdxs: Set<number> = new Set();
  const hits = def.format.match(/\$o[0-9]+/g);
  if (hits) {
    for (const hit of hits) {
      const idx = Number(hit.substr(2));
      boundYieldIdxs.add(idx);
    }
  }

  const unboundYieldIdxs: Set<number> = new Set();
  def.sig.yields.forEach((y, idx) => {
    if (!boundYieldIdxs.has(idx)) {
      unboundYieldIdxs.add(idx);
    }
  });

  if (unboundYieldIdxs.size === 0) {
    return undefined;
  } else if (unboundYieldIdxs.size === 1) {
    return [...unboundYieldIdxs][0];
  } else {
    throw new Error();
  }
}
