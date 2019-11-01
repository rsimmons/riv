import { RivFunctionDefinition, StreamDefinition, NativeFunctionDefinition, FunctionDefinition, UndefinedLiteralStreamDefinition, NumberLiteralStreamDefinition, ArrayLiteralStreamDefinition } from './newEssentialDefinition';
import { SignatureStreamParameter, SignatureFunctionParameter } from './Signature';

interface NodeCommon {
  readonly type: string;
  readonly children: ReadonlyArray<Node>;
  selectable: boolean;
  readonly selectionIds: Array<string>;
  parent: Node | null;
  childIdx: number | null; // what child number of our parent are we
}

export interface SimpleStreamDefinitionNode extends NodeCommon {
  readonly type: 'SimpleStreamDefinition';
  children: ReadonlyArray<StreamExpressionNode>;
  selectable: true;

  readonly definition: UndefinedLiteralStreamDefinition | NumberLiteralStreamDefinition | ArrayLiteralStreamDefinition;
}
export function isSimpleStreamDefinitionNode(node: Node): node is SimpleStreamDefinitionNode {
  return node.type === 'SimpleStreamDefinition';
}

export interface ApplicationNode extends NodeCommon {
  readonly type: 'Application';
  children: ReadonlyArray<StreamExpressionNode>;
  selectable: true;

  readonly definition: StreamDefinition;
  readonly appliedFunctionDefinition: FunctionDefinition;
}
export function isApplicationNode(node: Node): node is ApplicationNode {
  return node.type === 'Application';
}

export type StreamDefinitionNode = SimpleStreamDefinitionNode | ApplicationNode;
export function isStreamDefinitionNode(node: Node): node is StreamDefinitionNode {
  return isSimpleStreamDefinitionNode(node) || isApplicationNode(node);
}

export interface StreamReferenceNode extends NodeCommon {
  readonly type: 'StreamReference';
  children: readonly [];
  selectable: true;

  readonly targetDefinition: StreamDefinition;
}
export function isStreamReferenceNode(node: Node): node is StreamReferenceNode {
  return node.type === 'StreamReference';
}

export type StreamExpressionNode = StreamDefinitionNode | StreamReferenceNode;
export function isStreamExpressionNode(node: Node): node is StreamExpressionNode {
  return isStreamDefinitionNode(node) || isStreamReferenceNode(node);
}

export interface StreamParameterNode extends NodeCommon {
  readonly type: 'StreamParameter';
  children: readonly [];
  selectable: true;

  readonly parameter: SignatureStreamParameter;
}
export function isStreamParameterNode(node: Node): node is StreamParameterNode {
  return node.type === 'StreamParameter';
}

export interface FunctionParameterNode extends NodeCommon {
  readonly type: 'FunctionParameter';
  children: readonly [];
  selectable: true;

  readonly parameter: SignatureFunctionParameter;
}
export function isFunctionParameterNode(node: Node): node is FunctionParameterNode {
  return node.type === 'FunctionParameter';
}

export interface RivFunctionDefinitionStreamParametersNode extends NodeCommon {
  readonly type: 'RivFunctionDefinitionStreamParameters';
  children: ReadonlyArray<StreamParameterNode>;
  selectable: false;
  readonly selectionIds: string [];
}
export function isRivFunctionDefinitionStreamParametersNode(node: Node): node is RivFunctionDefinitionStreamParametersNode {
  return node.type === 'RivFunctionDefinitionStreamParameters';
}

export interface RivFunctionDefinitionStreamExpressionsNode extends NodeCommon {
  readonly type: 'RivFunctionDefinitionStreamExpressions';
  children: ReadonlyArray<StreamExpressionNode>;
  selectable: false;
  readonly selectionIds: string [];
}
export function isRivFunctionDefinitionStreamExpressionsNode(node: Node): node is RivFunctionDefinitionStreamExpressionsNode {
  return node.type === 'RivFunctionDefinitionStreamExpressions';
}

export interface RivFunctionDefinitionNode extends NodeCommon {
  readonly type: 'RivFunctionDefinition';
  children: readonly [RivFunctionDefinitionStreamParametersNode, RivFunctionDefinitionStreamExpressionsNode];
  selectable: true;

  readonly definition: RivFunctionDefinition;
}
export function isRivFunctionDefinitionNode(node: Node): node is RivFunctionDefinitionNode {
  return node.type === 'RivFunctionDefinition';
}

export interface NativeFunctionDefinitionNode extends NodeCommon {
  readonly type: 'NativeFunctionDefinition';
  children: readonly [];
  selectable: true;

  readonly definition: NativeFunctionDefinition;
}
export function isNativeFunctionDefinitionNode(node: Node): node is NativeFunctionDefinitionNode {
  return node.type === 'NativeFunctionDefinition';
}

export type FunctionDefinitionNode = RivFunctionDefinitionNode | NativeFunctionDefinitionNode;
export function isFunctionDefinitionNode(node: Node): node is FunctionDefinitionNode {
  return isRivFunctionDefinitionNode(node) || isNativeFunctionDefinitionNode(node);
}

export type Node = StreamExpressionNode | StreamParameterNode | FunctionParameterNode | RivFunctionDefinitionStreamParametersNode | RivFunctionDefinitionStreamExpressionsNode | RivFunctionDefinitionNode | NativeFunctionDefinitionNode;
export function isNode(node: Node): node is Node {
  return isStreamExpressionNode(node) || isStreamParameterNode(node) || isFunctionParameterNode(node) || isRivFunctionDefinitionStreamParametersNode(node) || isRivFunctionDefinitionStreamExpressionsNode(node) || isRivFunctionDefinitionNode(node) || isNativeFunctionDefinitionNode(node);
}
