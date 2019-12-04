import genuid from './uid';

/**
 * IDS
 */
export type StreamID = string;
export type FunctionID = string;

const STREAM_ID_PREFIX = 'S-';
export function generateStreamId(): StreamID {
  return STREAM_ID_PREFIX + genuid();
}
export function validStreamId(s: string): s is StreamID {
  return s.startsWith(STREAM_ID_PREFIX);
}

const FUNCTION_ID_PREFIX = 'F-';
export function generateFunctionId(): FunctionID {
  return FUNCTION_ID_PREFIX + genuid();
}
export function validFunctionId(s: string): s is FunctionID {
  return s.startsWith(FUNCTION_ID_PREFIX);
}

/**
 * NODE KINDS
 */
export enum NodeKind {
  Description = 'desc',
  UndefinedLiteral = 'und',
  NumberLiteral = 'num',
  ArrayLiteral = 'arr',
  StreamReference = 'sref',
  StreamIndirection = 'sind',
  Application = 'app',
  FunctionReference = 'fref',
  SignatureStreamParameter = 'sparam',
  SignatureFunctionParameter = 'fparam',
  SignatureYield = 'yield',
  Signature = 'sig',
  YieldExpression = 'yexp',
  TreeFunctionBody = 'tbody',
  TreeFunctionDefinition = 'tdef',
  NativeFunctionDefinition = 'ndef',
}

/**
 * COMMON NODES
 */
export interface DescriptionNode {
  readonly kind: NodeKind.Description;
  readonly text: string;
}

/**
 * STREAM NODES
 */
export interface UndefinedLiteralNode {
  readonly kind: NodeKind.UndefinedLiteral;
  readonly sid: StreamID;
}

export interface NumberLiteralNode {
  readonly kind: NodeKind.NumberLiteral;
  readonly sid: StreamID;
  readonly val: number;
}

export interface ArrayLiteralNode {
  readonly kind: NodeKind.ArrayLiteral;
  readonly sid: StreamID;
  readonly elems: ReadonlyArray<StreamExpressionNode>;
}

export interface StreamReferenceNode {
  readonly kind: NodeKind.StreamReference;
  readonly ref: StreamID; // the stream id we are referencing
}

export interface StreamIndirectionNode {
  readonly kind: NodeKind.StreamIndirection;
  readonly sid: StreamID;
  readonly desc?: DescriptionNode;
  readonly expr: StreamExpressionNode;
}

export interface ApplicationNode {
  readonly kind: NodeKind.Application;
  readonly sids: ReadonlyArray<StreamID>; // array since there can be multiple yields
  readonly func: FunctionExpressionNode; // function being applied
  readonly sargs: ReadonlyArray<StreamExpressionNode>;
  readonly fargs: ReadonlyArray<FunctionExpressionNode>;
}

// Stream parameter definitions (on the "inside" of a function def) are _not_ expressions.
export type StreamExpressionNode = UndefinedLiteralNode | NumberLiteralNode | ArrayLiteralNode | StreamReferenceNode | StreamIndirectionNode | ApplicationNode;
export function isStreamExpressionNode(node: Node): node is StreamExpressionNode {
  return (node.kind === NodeKind.UndefinedLiteral) || (node.kind === NodeKind.NumberLiteral) || (node.kind === NodeKind.ArrayLiteral) || (node.kind === NodeKind.StreamReference) || (node.kind === NodeKind.StreamIndirection) || (node.kind === NodeKind.Application);
}

/**
 * FUNCTION NODES
 */

export interface SignatureStreamParameterNode {
  readonly kind: NodeKind.SignatureStreamParameter;
  readonly desc?: DescriptionNode;
}

export interface SignatureFunctionParameterNode {
  readonly kind: NodeKind.SignatureFunctionParameter;
  readonly desc?: DescriptionNode;
  readonly sig: SignatureNode;
}

export interface SignatureYieldNode {
  readonly kind: NodeKind.SignatureYield;
  readonly desc?: DescriptionNode;
}

export interface SignatureNode {
  readonly kind: NodeKind.Signature;
  readonly streamParams: ReadonlyArray<SignatureStreamParameterNode>;
  readonly funcParams: ReadonlyArray<SignatureFunctionParameterNode>;
  readonly yields: ReadonlyArray<SignatureYieldNode>;
}

export interface YieldExpressionNode {
  readonly kind: NodeKind.YieldExpression;
  readonly idx: Number;
  readonly expr: StreamExpressionNode;
}

export type BodyExpressionNode = StreamExpressionNode | FunctionExpressionNode | YieldExpressionNode;
export function isBodyExpressionNode(node: Node): node is BodyExpressionNode {
  return isStreamExpressionNode(node) || isFunctionExpressionNode(node) || (node.kind === NodeKind.YieldExpression);
}

export interface TreeFunctionBodyNode {
  readonly kind: NodeKind.TreeFunctionBody;
  readonly exprs: ReadonlyArray<BodyExpressionNode>;
}

export interface TreeFunctionDefinitionNode {
  readonly kind: NodeKind.TreeFunctionDefinition;
  readonly fid: FunctionID;
  readonly desc?: DescriptionNode;
  readonly sig: SignatureNode;

  readonly spids: ReadonlyArray<StreamID>;
  readonly fpids: ReadonlyArray<FunctionID>;
  readonly body: TreeFunctionBodyNode;
}

export interface NativeFunctionDefinitionNode {
  readonly kind: NodeKind.NativeFunctionDefinition;
  readonly fid: FunctionID;
  readonly desc?: DescriptionNode;
  readonly sig: SignatureNode;

  // TODO: JS code as string?
}

export type FunctionDefinitionNode = TreeFunctionDefinitionNode | NativeFunctionDefinitionNode;
export function isFunctionDefinitionNode(node: Node): node is FunctionDefinitionNode {
  return (node.kind === NodeKind.TreeFunctionDefinition) || (node.kind === NodeKind.NativeFunctionDefinition);
}

export interface FunctionReferenceNode {
  readonly kind: NodeKind.FunctionReference;
  readonly ref: FunctionID; // the function id we are referencing
}

export type FunctionExpressionNode = FunctionReferenceNode | FunctionDefinitionNode;
export function isFunctionExpressionNode(node: Node): node is FunctionExpressionNode {
  return (node.kind === NodeKind.FunctionReference) || isFunctionDefinitionNode(node);
}

export type Node = DescriptionNode | SignatureNode | TreeFunctionBodyNode | BodyExpressionNode | SignatureStreamParameterNode | SignatureFunctionParameterNode | SignatureYieldNode;
