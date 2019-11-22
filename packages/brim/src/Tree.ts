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
  RefApplication = 'rapp',
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
  readonly desc: DescriptionNode | null;
}

export interface NumberLiteralNode {
  readonly kind: NodeKind.NumberLiteral;
  readonly sid: StreamID;
  readonly desc: DescriptionNode | null;
  readonly val: number;
}

export interface ArrayLiteralNode {
  readonly kind: NodeKind.ArrayLiteral;
  readonly sid: StreamID;
  readonly desc: DescriptionNode | null;
  readonly elems: ReadonlyArray<StreamExpressionNode>;
}

export interface StreamReferenceNode {
  readonly kind: NodeKind.StreamReference;
  readonly sid: StreamID; // the new stream id we are defining
  readonly desc: DescriptionNode | null;
  readonly ref: StreamID; // the stream id we are referencing
}

export interface RefApplicationNode {
  readonly kind: NodeKind.RefApplication;
  readonly sids: ReadonlyArray<StreamID>; // array since there can be multiple yields
  readonly desc: DescriptionNode | null;
  readonly func: FunctionID; // function being applied
  readonly sargs: ReadonlyArray<StreamExpressionNode>;
  readonly fargs: ReadonlyArray<FunctionExpressionNode>;
}

// NOTE: We may add a InlineApplicationNode, that is similar to RefApplicationNode but has the definition inline
// Doing it this way (vs. having ApplicationNode that takes a FunctionExpression) eliminates generating a lot of
// superfluous function ids and descriptions.

// Stream parameter definitions (on the "inside" of a function def) are _not_ expressions.
export type StreamExpressionNode = UndefinedLiteralNode | NumberLiteralNode | ArrayLiteralNode | StreamReferenceNode | RefApplicationNode;
export function isStreamExpressionNode(node: Node): node is StreamExpressionNode {
  return (node.kind === NodeKind.UndefinedLiteral) || (node.kind === NodeKind.NumberLiteral) || (node.kind === NodeKind.ArrayLiteral) || (node.kind === NodeKind.StreamReference) || (node.kind === NodeKind.RefApplication);
}

/**
 * FUNCTION NODES
 */

export interface SignatureStreamParameterNode {
  readonly kind: NodeKind.SignatureStreamParameter;
  readonly desc: DescriptionNode | null;
}

export interface SignatureFunctionParameterNode {
  readonly kind: NodeKind.SignatureFunctionParameter;
  readonly desc: DescriptionNode | null;
}

export interface SignatureYieldNode {
  readonly kind: NodeKind.SignatureYield;
  readonly desc: DescriptionNode | null;
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
  readonly desc: DescriptionNode | null;
  readonly sig: SignatureNode;

  readonly spids: ReadonlyArray<StreamID>;
  readonly fpids: ReadonlyArray<FunctionID>;
  readonly body: TreeFunctionBodyNode;
}

export interface NativeFunctionDefinitionNode {
  readonly kind: NodeKind.NativeFunctionDefinition;
  readonly fid: FunctionID;
  readonly desc: DescriptionNode | null;
  readonly sig: SignatureNode;

  // TODO: JS code as string?
}

export type FunctionDefinitionNode = TreeFunctionDefinitionNode | NativeFunctionDefinitionNode;
export function isFunctionDefinitionNode(node: Node): node is FunctionDefinitionNode {
  return (node.kind === NodeKind.TreeFunctionDefinition) || (node.kind === NodeKind.NativeFunctionDefinition);
}

export interface FunctionReferenceNode {
  readonly kind: NodeKind.FunctionReference;
  readonly fid: FunctionID; // the new function id we are defining
  readonly desc: DescriptionNode | null;
  readonly ref: FunctionID; // the function id we are referencing
}

export type FunctionExpressionNode = FunctionReferenceNode | FunctionDefinitionNode;
export function isFunctionExpressionNode(node: Node): node is FunctionExpressionNode {
  return (node.kind === NodeKind.FunctionReference) || isFunctionDefinitionNode(node);
}

export type Node = DescriptionNode | SignatureNode | TreeFunctionBodyNode | BodyExpressionNode | SignatureStreamParameterNode | SignatureFunctionParameterNode | SignatureYieldNode;
