import { ExecutionContext } from 'riv-runtime';
import { CompiledDefinition } from "./Compiler";

export type StreamID = string;
export type FunctionID = string;

export interface ProgramNode {
  readonly type: 'Program';
  readonly mainDefinition: UserFunctionNode;
}
export function isProgramNode(node: Node): node is ProgramNode {
  return node.type === 'Program';
}

export interface IdentifierNode {
  readonly type: 'Identifier';
  readonly name: string;
}
export function isIdentifierNode(node: Node): node is IdentifierNode {
  return node.type === 'Identifier';
}

export interface UndefinedExpressionNode {
  readonly type: 'UndefinedExpression';
  readonly streamId: StreamID;
  readonly identifier: IdentifierNode | null;
}
export function isUndefinedExpressionNode(node: Node): node is UndefinedExpressionNode {
  return node.type === 'UndefinedExpression';
}

export interface IntegerLiteralNode {
  readonly type: 'IntegerLiteral';
  readonly streamId: StreamID;
  readonly identifier: IdentifierNode | null;
  readonly value: number;
}
export function isIntegerLiteralNode(node: Node): node is IntegerLiteralNode {
  return node.type === 'IntegerLiteral';
}

export interface ArrayLiteralNode {
  readonly type: 'ArrayLiteral';
  readonly streamId: StreamID;
  readonly identifier: IdentifierNode | null;
  readonly items: ReadonlyArray<ExpressionNode>;
}
export function isArrayLiteralNode(node: Node): node is ArrayLiteralNode {
  return node.type === 'ArrayLiteral';
}

export interface StreamReferenceNode {
  readonly type: 'StreamReference';
  readonly streamId: StreamID;
  readonly identifier: IdentifierNode | null;
  readonly targetStreamId: StreamID;
}
export function isStreamReferenceNode(node: Node): node is StreamReferenceNode {
  return node.type === 'StreamReference';
}

export interface ApplicationNode {
  readonly type: 'Application';
  readonly streamId: StreamID, // stream of the function "output"
  readonly identifier: IdentifierNode | null;
  readonly functionId: FunctionID; // the function we are applying (calling), could be user-defined or external
  readonly arguments: ReadonlyArray<ExpressionNode>;
  readonly functionArguments: ReadonlyArray<UserFunctionNode>;
}
export function isApplicationNode(node: Node): node is ApplicationNode {
  return node.type === 'Application';
}

export interface ParameterNode {
  readonly type: 'Parameter';
  readonly streamId: StreamID;
  readonly identifier: IdentifierNode | null;
}
export function isParameterNode(node: Node): node is ParameterNode {
  return node.type === 'Parameter';
}

export type ExpressionNode = UndefinedExpressionNode | IntegerLiteralNode | ArrayLiteralNode | StreamReferenceNode | ApplicationNode | ParameterNode;
export function isExpressionNode(node: Node): node is ExpressionNode {
  return isUndefinedExpressionNode(node)
    || isIntegerLiteralNode(node)
    || isArrayLiteralNode(node)
    || isStreamReferenceNode(node)
    || isApplicationNode(node)
    || isParameterNode(node);
}

export interface FunctionSignature {
  readonly parameters: ReadonlyArray<string>; // just the names for now
  readonly functionParameters: ReadonlyArray<[string, FunctionSignature]>; // names and signatures
}

export interface NativeFunctionNode {
  readonly type: 'NativeFunction';
  readonly functionId: FunctionID;
  readonly identifier: IdentifierNode | null;
  readonly signature: FunctionSignature;
}
export function isNativeFunctionNode(node: Node): node is NativeFunctionNode {
  return node.type === 'NativeFunction';
}

export interface UserFunctionNode {
  readonly type: 'UserFunction';
  readonly functionId: FunctionID;
  readonly identifier: IdentifierNode | null;
  readonly signature: FunctionSignature;
  readonly parameters: ReadonlyArray<ParameterNode>;
  readonly functionParameterFunctionIds: ReadonlyArray<FunctionID>;
  readonly expressions: ReadonlyArray<ExpressionNode>; // the "body" of the function
}
export function isUserFunctionNode(node: Node): node is UserFunctionNode {
  return node.type === 'UserFunction';
}

export type FunctionNode = NativeFunctionNode | UserFunctionNode;
export function isFunctionNode(node: Node): node is FunctionNode {
  return isNativeFunctionNode(node) || isUserFunctionNode(node);
}

export type Node = ProgramNode | IdentifierNode | ExpressionNode | FunctionNode;
export function isNode(node: any): node is Node {
  return isProgramNode(node) || isIdentifierNode(node) || isExpressionNode(node) || isFunctionNode(node);
}

export type Path = (string | number)[];

export type NodeEditState = {
  readonly originalNode: Node,
  readonly tentativeNode: Node,
} | null;

export interface State {
  readonly program: ProgramNode;
  readonly selectionPath: Path;
  readonly editingSelected: NodeEditState;
  readonly nativeFunctions: ReadonlyArray<NativeFunctionNode>;
  readonly derivedLookups: {
    streamIdToNode: ReadonlyMap<StreamID, ExpressionNode> | null;
    functionIdToNode: ReadonlyMap<FunctionID, FunctionNode> | null;
    nodeToPath: ReadonlyMap<Node, Path> | null;
  };
  readonly liveMain: {
    context: ExecutionContext;
    compiledDefinition: CompiledDefinition | null;
    updateCompiledDefinition: (newDefinition: CompiledDefinition) => void;
  } | null;
}
