import { NodeKind, StreamID, StreamExpressionNode } from './Tree';

export function streamExprReturnedId(node: StreamExpressionNode): StreamID | undefined {
  switch (node.kind) {
    case NodeKind.UndefinedLiteral:
    case NodeKind.NumberLiteral:
    case NodeKind.TextLiteral:
    case NodeKind.BooleanLiteral:
      return node.sid;

    case NodeKind.StreamReference:
      return node.ref;

    case NodeKind.Application:
      return node.rid;

    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
      throw new Error();
    }
  }
}
