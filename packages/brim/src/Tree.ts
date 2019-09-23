import { StreamID, FunctionID } from './Identifier';

/**
 * NODE NAME
 */
type Name = string | null;

/**
 * STREAM LITERALS
 */
export interface UndefinedLiteralNode {
  readonly type: 'UndefinedLiteral';
  readonly id: StreamID;
  readonly children: readonly [];
}
export function isUndefinedLiteralNode(node: Node): node is UndefinedLiteralNode {
  return node.type === 'UndefinedLiteral';
}

export interface NumberLiteralNode {
  readonly type: 'NumberLiteral';
  readonly id: StreamID;
  readonly children: readonly [];
  readonly value: number;
}
export function isNumberLiteralNode(node: Node): node is NumberLiteralNode {
  return node.type === 'NumberLiteral';
}

export interface ArrayLiteralNode {
  readonly type: 'ArrayLiteral';
  readonly id: StreamID;
  readonly children: ReadonlyArray<StreamExpressionNode>;
}
export function isArrayLiteralNode(node: Node): node is ArrayLiteralNode {
  return node.type === 'ArrayLiteral';
}

export type LiteralNode = UndefinedLiteralNode | NumberLiteralNode | ArrayLiteralNode; // stream literals only, we don't refer to function definitions as literals
export function isLiteralNode(node: Node): node is LiteralNode {
  return isUndefinedLiteralNode(node) || isNumberLiteralNode(node) || isArrayLiteralNode(node);
}

/**
 * REFERENCES
 */
export interface StreamReferenceNode {
  readonly type: 'StreamReference';
  readonly id: StreamID;
  readonly children: readonly [];
  readonly targetStreamId: StreamID;
}
export function isStreamReferenceNode(node: Node): node is StreamReferenceNode {
  return node.type === 'StreamReference';
}

export interface FunctionReferenceNode {
  readonly type: 'FunctionReference';
  readonly id: FunctionID;
  readonly children: readonly [];
  readonly targetFunctionId: FunctionID;
}
export function isFunctionReferenceNode(node: Node): node is FunctionReferenceNode {
  return node.type === 'FunctionReference';
}

/**
 * INDIRECTION
 */
export interface StreamIndirectionNode {
  readonly type: 'StreamIndirection';
  readonly id: StreamID;
  readonly children: readonly [StreamExpressionNode];
  readonly name: Name;
}
export function isStreamIndirectionNode(node: Node): node is StreamIndirectionNode {
  return node.type === 'StreamIndirection';
}

/**
 * EXPRESSIONS
 *
 * An expression is a user-editable node that defines a stream/function.
 * Since parameters are "fixed" they are excluded.
 */
export type StreamExpressionNode = LiteralNode |  ApplicationNode | StreamReferenceNode | StreamIndirectionNode;
export function isStreamExpressionNode(node: Node): node is StreamExpressionNode {
  return isLiteralNode(node) || isApplicationNode(node) || isStreamReferenceNode(node) || isStreamIndirectionNode(node);
}

export type FunctionExpressionNode = FunctionDefinitionNode | FunctionReferenceNode;
export function isFunctionExpressionNode(node: Node): node is FunctionExpressionNode {
  return isFunctionDefinitionNode(node) || isFunctionReferenceNode(node);
}

export type ExpressionNode = StreamExpressionNode | FunctionExpressionNode;
export function isExpressionNode(node: Node): node is ExpressionNode {
  return isStreamExpressionNode(node) || isFunctionExpressionNode(node);
}

/**
 * STREAM CREATION
 *
 * A stream creation defines a new stream id.
 */
export type StreamCreationNode = StreamExpressionNode | StreamParameterNode;
export function isStreamCreationNode(node: Node): node is StreamCreationNode {
  return isStreamExpressionNode(node) || isStreamParameterNode(node);
}

/**
 * APPLICATION
 */
export interface ApplicationNode {
  readonly type: 'Application';
  readonly id: StreamID;
  readonly children: ReadonlyArray<ExpressionNode>;
  readonly functionId: FunctionID;
}
export function isApplicationNode(node: Node): node is ApplicationNode {
  return node.type === 'Application';
}


/**
 * FUNCTION SIGNATURE
 */
export type ParameterType = 'stream' | FunctionSignature;

export interface FunctionSignature {
  readonly parameters: ReadonlyArray<{
    name: string;
    type: ParameterType;
  }>;
  readonly yields: boolean;
}

/**
 * USER FUNCTION DEFINITION
 */
export interface StreamParameterNode {
  readonly type: 'StreamParameter';
  readonly id: StreamID;
  readonly children: readonly [];
  readonly name: Name;
}
export function isStreamParameterNode(node: Node): node is StreamParameterNode {
  return node.type === 'StreamParameter';
}

export interface FunctionParameterNode {
  readonly type: 'FunctionParameter';
  readonly id: FunctionID;
  readonly children: readonly [];
  readonly name: Name;
}
export function isFunctionParameterNode(node: Node): node is FunctionParameterNode {
  return node.type === 'FunctionParameter';
}

export type ParameterNode = StreamParameterNode | FunctionParameterNode;
export function isParameterNode(node: Node): node is ParameterNode {
  return isStreamParameterNode(node) || isFunctionParameterNode(node);
}

export interface UserFunctionDefinitionParametersNode {
  readonly type: 'UserFunctionDefinitionParameters';
  readonly children: ReadonlyArray<ParameterNode>;
}
export function isUserFunctionDefinitionParametersNode(node: Node): node is UserFunctionDefinitionParametersNode {
  return node.type === 'UserFunctionDefinitionParameters';
}

export interface UserFunctionDefinitionExpressionsNode {
  readonly type: 'UserFunctionDefinitionExpressions';
  readonly children: ReadonlyArray<ExpressionNode>;
}
export function isUserFunctionDefinitionExpressionsNode(node: Node): node is UserFunctionDefinitionExpressionsNode {
  return node.type === 'UserFunctionDefinitionExpressions';
}

export interface UserFunctionDefinitionNode {
  readonly type: 'UserFunctionDefinition';
  readonly id: FunctionID;
  readonly children: readonly [UserFunctionDefinitionParametersNode, UserFunctionDefinitionExpressionsNode];
  readonly name: Name;
  readonly signature: FunctionSignature;
}
export function isUserFunctionDefinitionNode(node: Node): node is UserFunctionDefinitionNode {
  return node.type === 'UserFunctionDefinition';
}

/**
 * NATIVE FUNCTION DEFINITION
 */
export interface NativeFunctionDefinitionNode {
  readonly type: 'NativeFunctionDefinition';
  readonly id: FunctionID;
  readonly children: readonly [];
  readonly name: Name;
  readonly signature: FunctionSignature;
}
export function isNativeFunctionDefinitionNode(node: Node): node is NativeFunctionDefinitionNode {
  return node.type === 'NativeFunctionDefinition';
}

/**
 * FUNCTION DEFINITION
 */
export type FunctionDefinitionNode = NativeFunctionDefinitionNode | UserFunctionDefinitionNode;
export function isFunctionDefinitionNode(node: Node): node is FunctionDefinitionNode {
  return isNativeFunctionDefinitionNode(node) || isUserFunctionDefinitionNode(node);
}

/**
 * PROGRAM
 */
export interface ProgramNode {
  readonly type: 'Program';
  readonly programId: string;
  readonly children: readonly [UserFunctionDefinitionNode];
  readonly name: string;
}
export function isProgramNode(node: Node): node is ProgramNode {
  return node.type === 'Program';
}

/**
 * NODE
 */
export type Node = ProgramNode | ExpressionNode | ParameterNode | UserFunctionDefinitionParametersNode | UserFunctionDefinitionExpressionsNode;
export function isNode(node: Node): node is Node {
  return isProgramNode(node) || isExpressionNode(node) || isParameterNode(node) || isUserFunctionDefinitionParametersNode(node) || isUserFunctionDefinitionExpressionsNode(node);
}

export type IDedNode = ExpressionNode | ParameterNode;
export function isIDedNode(node: Node): node is IDedNode {
  return isExpressionNode(node) || isParameterNode(node);
}

export type NamedNode = ParameterNode | StreamIndirectionNode;
export function isNamedNode(node: Node): node is NamedNode {
  return isParameterNode(node) || isStreamIndirectionNode(node);
}
