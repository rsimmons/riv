import { NodeKind, FunctionInterfaceNode, FunctionDefinitionNode, UndefinedLiteralNode, UID } from './Tree';
import genuid from '../util/uid';

export function functionInterfaceAsPlainText(ifaceNode: FunctionInterfaceNode): string {
  // return templateToPlainText(functionInterfaceFromNode(ifaceNode).tmpl);
  // TODO: fix
  return ifaceNode.name.text;
}

export function defaultTreeDefFromFunctionInterface(iface: FunctionInterfaceNode): FunctionDefinitionNode {
  const pids: ReadonlyMap<UID, UID> = new Map(iface.params.map(param => [param.nid, genuid()]));

  const out: UndefinedLiteralNode | null = iface.output ? {
    kind: NodeKind.UndefinedLiteral,
    nid: genuid(),
  } : null;

  return {
    kind: NodeKind.FunctionDefinition,
    nid: genuid(),
    iface,
    impl: {
      kind: NodeKind.TreeImpl,
      nid: genuid(),
      pids,
      body: [
        {
          kind: NodeKind.UndefinedLiteral,
          nid: genuid(),
        },
      ],
      out,
    }
  };
}
