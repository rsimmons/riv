import { RivFunctionDefinition, StreamDefinition, NativeFunctionDefinition, FunctionDefinition, UndefinedLiteralStreamDefinition, NumberLiteralStreamDefinition, ArrayLiteralStreamDefinition } from './newEssentialDefinition';
import { SignatureStreamParameter, SignatureFunctionParameter } from './Signature';

export interface SimpleStreamDefinitionNode {
  readonly type: 'SimpleStreamDefinition';
  readonly children: ReadonlyArray<StreamExpressionNode>;
  readonly selectionIds: ReadonlyArray<string>;

  readonly definition: UndefinedLiteralStreamDefinition | NumberLiteralStreamDefinition | ArrayLiteralStreamDefinition;
}
export function isSimpleStreamDefinitionNode(node: Node): node is SimpleStreamDefinitionNode {
  return node.type === 'SimpleStreamDefinition';
}

export interface ApplicationNode {
  readonly type: 'Application';
  readonly children: ReadonlyArray<StreamExpressionNode>;
  readonly selectionIds: ReadonlyArray<string>;

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

export interface StreamReferenceNode {
  readonly type: 'StreamReference';
  readonly children: readonly [];
  readonly selectionIds: ReadonlyArray<string>;

  readonly targetDefinition: StreamDefinition;
}
export function isStreamReferenceNode(node: Node): node is StreamReferenceNode {
  return node.type === 'StreamReference';
}

export type StreamExpressionNode = StreamDefinitionNode | StreamReferenceNode;
export function isStreamExpressionNode(node: Node): node is StreamExpressionNode {
  return isStreamDefinitionNode(node) || isStreamReferenceNode(node);
}

export interface StreamParameterNode {
  readonly type: 'StreamParameter';
  readonly children: readonly [];
  readonly selectionIds: ReadonlyArray<string>;

  readonly parameter: SignatureStreamParameter;
}
export function isStreamParameterNode(node: Node): node is StreamParameterNode {
  return node.type === 'StreamParameter';
}

export interface FunctionParameterNode {
  readonly type: 'FunctionParameter';
  readonly children: readonly [];
  readonly selectionIds: ReadonlyArray<string>;

  readonly parameter: SignatureFunctionParameter;
}
export function isFunctionParameterNode(node: Node): node is FunctionParameterNode {
  return node.type === 'FunctionParameter';
}

export interface RivFunctionDefinitionStreamParametersNode {
  readonly type: 'RivFunctionDefinitionStreamParameters';
  readonly children: ReadonlyArray<StreamParameterNode>;
  readonly selectionIds: [];
}
export function isRivFunctionDefinitionStreamParametersNode(node: Node): node is RivFunctionDefinitionStreamParametersNode {
  return node.type === 'RivFunctionDefinitionStreamParameters';
}

export interface RivFunctionDefinitionStreamExpressionsNode {
  readonly type: 'RivFunctionDefinitionStreamExpressions';
  readonly children: ReadonlyArray<StreamExpressionNode>;
  readonly selectionIds: [];
}
export function isRivFunctionDefinitionStreamExpressionsNode(node: Node): node is RivFunctionDefinitionStreamExpressionsNode {
  return node.type === 'RivFunctionDefinitionStreamExpressions';
}

export interface RivFunctionDefinitionNode {
  readonly type: 'RivFunctionDefinition';
  readonly children: readonly [RivFunctionDefinitionStreamParametersNode, RivFunctionDefinitionStreamExpressionsNode];
  readonly selectionIds: ReadonlyArray<string>;

  readonly definition: RivFunctionDefinition;
}
export function isRivFunctionDefinitionNode(node: Node): node is RivFunctionDefinitionNode {
  return node.type === 'RivFunctionDefinition';
}

export interface NativeFunctionDefinitionNode {
  readonly type: 'NativeFunctionDefinition';
  readonly children: readonly [];
  readonly selectionIds: ReadonlyArray<string>;

  readonly definition: NativeFunctionDefinition;
}
export function isNativeFunctionDefinitionNode(node: Node): node is NativeFunctionDefinitionNode {
  return node.type === 'NativeFunctionDefinition';
}

export type FunctionDefinitionNode = RivFunctionDefinitionNode | NativeFunctionDefinitionNode;
export function isFunctionDefinitionNode(node: Node): node is FunctionDefinitionNode {
  return isRivFunctionDefinitionNode(node) || isNativeFunctionDefinitionNode(node);
}

export interface ProgramNode {
  readonly type: 'Program';
  readonly children: readonly [RivFunctionDefinitionNode];
  readonly selectionIds: ReadonlyArray<string>;

  readonly programId: string;
  readonly name: string;
}
export function isProgramNode(node: Node): node is ProgramNode {
  return node.type === 'Program';
}

export type Node = StreamExpressionNode | StreamParameterNode | FunctionParameterNode | RivFunctionDefinitionStreamParametersNode | RivFunctionDefinitionStreamExpressionsNode | RivFunctionDefinitionNode | NativeFunctionDefinitionNode | ProgramNode;
export function isNode(node: Node): node is Node {
  return isStreamExpressionNode(node) || isStreamParameterNode(node) || isFunctionParameterNode(node) || isRivFunctionDefinitionStreamParametersNode(node) || isRivFunctionDefinitionStreamExpressionsNode(node) || isRivFunctionDefinitionNode(node) || isNativeFunctionDefinitionNode(node) || isProgramNode(node);
}
