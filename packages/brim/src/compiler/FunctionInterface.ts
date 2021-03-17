import { TemplateSegment, TemplateGroup, TemplateLayout, templateToPlainText } from './TemplateLayout';
import { ApplicationSettings, NodeKind, FunctionInterfaceNode, TreeFunctionDefinitionNode, generateFunctionId, generateStreamId, BodyExpressionNode } from './Tree';

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

export function defaultTreeImplFromFunctionInterface(iface: FunctionInterfaceNode): TreeFunctionDefinitionNode {
  const bodyExprs: Array<BodyExpressionNode> = [];

  if (iface.ret.kind === NodeKind.FIReturn) {
    bodyExprs.push({
      kind: NodeKind.YieldExpression,
      out: null,
      expr: {kind: NodeKind.UndefinedLiteral, sid: generateStreamId()},
    });
  }

  iface.params.forEach(param => {
    if (param.kind === NodeKind.FIOutParam) {
      bodyExprs.push({
        kind: NodeKind.YieldExpression,
        out: param.pid,
        expr: {kind: NodeKind.UndefinedLiteral, sid: generateStreamId()},
      });
    }
  });

  return {
    kind: NodeKind.TreeFunctionDefinition,
    fid: generateFunctionId(),
    iface,
    bodyExprs,
  };
}
