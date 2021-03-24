import { ApplicationSettings, NodeKind, FunctionInterfaceNode, TreeImplBodyNode, FunctionDefinitionNode, UndefinedLiteralNode, UID } from './Tree';
import genuid from '../util/uid';

export type DynamicInterfaceEditAction = 'insert-before' | 'insert-after' | 'delete';

export type DynamicInterfaceChange = {
  readonly newSettings: ApplicationSettings;
  readonly remap?: {
    // for each of these, the array is of indexes into the old params/yields
    streamParams: ReadonlyArray<number | undefined>;
    funcParams: ReadonlyArray<number | undefined>;
    yields: ReadonlyArray<number | undefined>;
  }
  readonly newSelectedKey?: string | 'parent';
}

export function functionInterfaceAsPlainText(ifaceNode: FunctionInterfaceNode): string {
  // return templateToPlainText(functionInterfaceFromNode(ifaceNode).tmpl);
  // TODO: fix
  return ifaceNode.name.text;
}

export function defaultTreeDefFromFunctionInterface(iface: FunctionInterfaceNode): FunctionDefinitionNode {
  const pids: ReadonlyMap<UID, UID> = new Map(iface.params.map(param => [param.nid, genuid()]));

  const body: Array<TreeImplBodyNode> = [];

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
      body,
      out,
    }
  };
}
