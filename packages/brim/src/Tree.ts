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
  readonly children: [];
  readonly name: Name;
}
export function isUndefinedLiteralNode(node: Node): node is UndefinedLiteralNode {
  return node.type === 'UndefinedLiteral';
}

export interface NumberLiteralNode {
  readonly type: 'NumberLiteral';
  readonly id: StreamID;
  readonly children: [];
  readonly name: Name;
  readonly value: number;
}
export function isNumberLiteralNode(node: Node): node is NumberLiteralNode {
  return node.type === 'NumberLiteral';
}

export interface ArrayLiteralNode {
  readonly type: 'ArrayLiteral';
  readonly id: StreamID;
  readonly children: ReadonlyArray<StreamExpressionNode>;
  readonly name: Name;
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
  readonly id: null;
  readonly children: [];
  readonly targetStreamId: StreamID;
}
export function isStreamReferenceNode(node: Node): node is StreamReferenceNode {
  return node.type === 'StreamReference';
}

export interface FunctionReferenceNode {
  readonly type: 'FunctionReference';
  readonly id: null;
  readonly children: [];
  readonly targetFunctionId: FunctionID;
}
export function isFunctionReferenceNode(node: Node): node is FunctionReferenceNode {
  return node.type === 'FunctionReference';
}

/**
 * EXPRESSIONS
 *
 * An expression is a user-editable node that _identifies_ a stream/function, but does not
 * necessarily define a new stream/function. Since parameters are "fixed" they are excluded.
 */
export type StreamExpressionNode = LiteralNode | ApplicationNode | StreamReferenceNode;
export function isStreamExpressionNode(node: Node): node is StreamExpressionNode {
  return isLiteralNode(node) || isApplicationNode(node) || isStreamReferenceNode(node);
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
 * STREAM DEFINITION
 *
 * A stream definition defines a new stream id (which means stream references are excluded).
 */
export type StreamDefinitionNode = LiteralNode | ApplicationNode | ParameterNode;
export function isStreamDefinitionNode(node: Node): node is StreamDefinitionNode {
  return isLiteralNode(node) || isApplicationNode(node) || isParameterNode(node);
}

/**
 * APPLICATION
 */
export interface ApplicationNode {
  readonly type: 'Application';
  readonly id: StreamID;
  readonly children: ReadonlyArray<ExpressionNode>;
  readonly name: Name;
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
  readonly children: [];
  readonly name: Name;
}
export function isStreamParameterNode(node: Node): node is StreamParameterNode {
  return node.type === 'StreamParameter';
}

export interface FunctionParameterNode {
  readonly type: 'FunctionParameter';
  readonly id: FunctionID;
  readonly children: [];
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
  readonly id: null;
  readonly children: ReadonlyArray<ParameterNode>;
}
export function isUserFunctionDefinitionParametersNode(node: Node): node is UserFunctionDefinitionParametersNode {
  return node.type === 'UserFunctionDefinitionParameters';
}

export interface UserFunctionDefinitionExpressionsNode {
  readonly type: 'UserFunctionDefinitionExpressions';
  readonly id: null;
  readonly children: ReadonlyArray<ExpressionNode>;
}
export function isUserFunctionDefinitionExpressionsNode(node: Node): node is UserFunctionDefinitionExpressionsNode {
  return node.type === 'UserFunctionDefinitionExpressions';
}

export interface UserFunctionDefinitionNode {
  readonly type: 'UserFunctionDefinition';
  readonly id: FunctionID;
  readonly children: [UserFunctionDefinitionParametersNode, UserFunctionDefinitionExpressionsNode];
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
  readonly children: [];
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
  readonly id: null;
  readonly children: [UserFunctionDefinitionNode];
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
