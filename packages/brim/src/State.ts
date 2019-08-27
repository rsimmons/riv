import { ExecutionContext } from 'riv-runtime';
import { CompiledDefinition } from "./Compiler";

export type StreamID = string;
export type FunctionID = string;

export interface ProgramNode {
  type: 'Program';
  mainDefinition: UserFunctionNode;
}
export function isProgramNode(node: Node): node is ProgramNode {
  return node.type === 'Program';
}

export interface IdentifierNode {
  type: 'Identifier';
  name: string;
}
export function isIdentifierNode(node: Node): node is IdentifierNode {
  return node.type === 'Identifier';
}

export interface UndefinedExpressionNode {
  type: 'UndefinedExpression';
  streamId: StreamID;
  identifier: IdentifierNode | null;
}
export function isUndefinedExpressionNode(node: Node): node is UndefinedExpressionNode {
  return node.type === 'UndefinedExpression';
}

export interface IntegerLiteralNode {
  type: 'IntegerLiteral';
  streamId: StreamID;
  identifier: IdentifierNode | null;
  value: number;
}
export function isIntegerLiteralNode(node: Node): node is IntegerLiteralNode {
  return node.type === 'IntegerLiteral';
}

export interface ArrayLiteralNode {
  type: 'ArrayLiteral';
  streamId: StreamID;
  identifier: IdentifierNode | null;
  items: ExpressionNode[];
}
export function isArrayLiteralNode(node: Node): node is ArrayLiteralNode {
  return node.type === 'ArrayLiteral';
}

export interface StreamReferenceNode {
  type: 'StreamReference';
  streamId: StreamID;
  identifier: IdentifierNode | null;
  targetStreamId: StreamID;
}
export function isStreamReferenceNode(node: Node): node is StreamReferenceNode {
  return node.type === 'StreamReference';
}

export interface ApplicationNode {
  type: 'Application';
  streamId: StreamID, // stream of the function "output"
  identifier: IdentifierNode | null;
  functionId: FunctionID; // the function we are applying (calling), could be user-defined or external
  arguments: Array<ExpressionNode>;
  functionArguments: Array<UserFunctionNode>;
}
export function isApplicationNode(node: Node): node is ApplicationNode {
  return node.type === 'Application';
}

export interface ParameterNode {
  type: 'Parameter';
  streamId: StreamID;
  identifier: IdentifierNode | null;
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
  parameters: Array<string>; // just the names for now
  functionParameters: Array<[string, FunctionSignature]>; // names and signatures
}

export interface NativeFunctionNode {
  type: 'NativeFunction';
  functionId: FunctionID;
  identifier: IdentifierNode | null;
  signature: FunctionSignature;
}
export function isNativeFunctionNode(node: Node): node is NativeFunctionNode {
  return node.type === 'NativeFunction';
}

export interface UserFunctionNode {
  type: 'UserFunction';
  functionId: FunctionID;
  identifier: IdentifierNode | null;
  signature: FunctionSignature;
  parameters: Array<ParameterNode>;
  functionParameterFunctionIds: Array<FunctionID>;
  expressions: ExpressionNode[]; // the "body" of the function
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

export interface State {
  program: ProgramNode;
  selectionPath: Path;
  editingSelected: boolean;
  nativeFunctions: Array<NativeFunctionNode>;
  derivedLookups: {
    streamIdToNode: Map<StreamID, ExpressionNode>;
    // nameToNodes: Map<string, Node[]>;
    functionIdToNode: Map<FunctionID, FunctionNode>;
    // nameToFunctions: Map<string, Node[]>;
    nodeToPath: Map<Node, Path>;
  } | undefined;
  liveMain: {
    context: ExecutionContext;
    compiledDefinition: CompiledDefinition | null;
    updateCompiledDefinition: (newDefinition: CompiledDefinition) => void;
  } | undefined;
}
