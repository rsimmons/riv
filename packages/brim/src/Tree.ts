import genuid from './uid';
import { FunctionUI } from './FunctionUI';

/**
 * IDS
 */
export type StreamID = string;
export type FunctionID = string;
export type ApplicationID = string;

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

const APPLICATION_ID_PREFIX = 'A-';
export function generateApplicationId(): ApplicationID {
  return APPLICATION_ID_PREFIX + genuid();
}
export function validApplicationId(s: string): s is ApplicationID {
  return s.startsWith(APPLICATION_ID_PREFIX);
}

/**
 * NODE KINDS
 */
export enum NodeKind {
  Name = 'name',
  UndefinedLiteral = 'und',
  NumberLiteral = 'num',
  TextLiteral = 'str',
  BooleanLiteral = 'bool',
  ArrayLiteral = 'arr',
  StreamReference = 'sref',
  Application = 'app',
  FunctionReference = 'fref',
  SignatureStreamParameter = 'sig-sparam',
  SignatureFunctionParameter = 'sig-fparam',
  SignatureYield = 'sig-yield',
  Signature = 'sig',
  YieldExpression = 'yield',
  StreamParameter = 'sparam',
  FunctionParameter = 'fparam',
  TreeFunctionBody = 'tbody',
  TreeFunctionDefinition = 'tdef',
  NativeFunctionDefinition = 'ndef',
}

/**
 * COMMON NODES
 */
export interface NameNode {
  readonly kind: NodeKind.Name;
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

export interface TextLiteralNode {
  readonly kind: NodeKind.TextLiteral;
  readonly sid: StreamID;
  readonly val: string;
}

export interface BooleanLiteralNode {
  readonly kind: NodeKind.BooleanLiteral;
  readonly sid: StreamID;
  readonly val: boolean;
}

export type SimpleLiteralNode = UndefinedLiteralNode | NumberLiteralNode | TextLiteralNode | BooleanLiteralNode;
export function isSimpleLiteralNode(node: Node): node is SimpleLiteralNode {
  return (node.kind === NodeKind.UndefinedLiteral) || (node.kind === NodeKind.NumberLiteral) || (node.kind === NodeKind.TextLiteral) || (node.kind === NodeKind.BooleanLiteral);
}

export interface ArrayLiteralNode {
  readonly kind: NodeKind.ArrayLiteral;
  readonly aid: ApplicationID;
  readonly sid: StreamID;
  readonly elems: ReadonlyArray<StreamExpressionNode>;
}

export interface StreamReferenceNode {
  readonly kind: NodeKind.StreamReference;
  readonly ref: StreamID; // the stream id we are referencing
}

export interface ApplicationOut {
  readonly sid: StreamID;
  readonly name: NameNode | null; // if this output was given a local name
}

export interface ApplicationNode {
  readonly kind: NodeKind.Application;
  readonly aid: ApplicationID;
  readonly outs: ReadonlyArray<ApplicationOut>; // array since there can be multiple yields
  readonly func: FunctionExpressionNode; // function being applied
  readonly sargs: ReadonlyArray<StreamExpressionNode>;
  readonly fargs: ReadonlyArray<FunctionExpressionNode>;
}

// Stream parameter definitions (on the "inside" of a function def) are _not_ expressions.
export type StreamExpressionNode = SimpleLiteralNode | ArrayLiteralNode | StreamReferenceNode | ApplicationNode;
export function isStreamExpressionNode(node: Node): node is StreamExpressionNode {
  return isSimpleLiteralNode(node) || (node.kind === NodeKind.ArrayLiteral) || (node.kind === NodeKind.StreamReference) || (node.kind === NodeKind.Application);
}

/**
 * FUNCTION NODES
 */

export interface SignatureStreamParameterNode {
  readonly kind: NodeKind.SignatureStreamParameter;
  // eventually, type info will go here
}

// When we auto-generate a function as an argument for this function-parameter,
//  prefill its (internal) parameter/yield names as such.
export interface SignatureFunctionParameterTemplateNames {
  readonly streamParams: ReadonlyArray<string>;
  readonly funcParams: ReadonlyArray<string>;
  readonly yields: ReadonlyArray<string>;
}

export interface SignatureFunctionParameterNode {
  readonly kind: NodeKind.SignatureFunctionParameter;
  readonly sig: SignatureNode;
  readonly templateNames: SignatureFunctionParameterTemplateNames;
}

export interface SignatureYieldNode {
  readonly kind: NodeKind.SignatureYield;
  // eventually, type info will go here
}

export interface SignatureNode {
  readonly kind: NodeKind.Signature;
  readonly streamParams: ReadonlyArray<SignatureStreamParameterNode>;
  readonly funcParams: ReadonlyArray<SignatureFunctionParameterNode>;
  readonly yields: ReadonlyArray<SignatureYieldNode>;
  readonly returnedIdx: number | undefined; // which of the yields (if any) is returned to the tree-parent
}

export interface YieldExpressionNode {
  readonly kind: NodeKind.YieldExpression;
  readonly idx: number;
  readonly name: NameNode;
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

export interface StreamParameterNode {
  readonly kind: NodeKind.StreamParameter;
  readonly sid: StreamID;
  readonly name: NameNode;
}

export interface FunctionParameterNode {
  readonly kind: NodeKind.FunctionParameter;
  readonly fid: FunctionID;
  readonly name: NameNode;
}

export interface TreeFunctionDefinitionNode {
  readonly kind: NodeKind.TreeFunctionDefinition;
  readonly fid: FunctionID;
  readonly sig: SignatureNode;
  readonly ui: FunctionUI;

  readonly sparams: ReadonlyArray<StreamParameterNode>;
  readonly fparams: ReadonlyArray<FunctionParameterNode>;
  readonly body: TreeFunctionBodyNode;
}

export interface NativeFunctionDefinitionNode {
  readonly kind: NodeKind.NativeFunctionDefinition;
  readonly fid: FunctionID;
  readonly sig: SignatureNode;
  readonly ui: FunctionUI;

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

export type Node = NameNode | SignatureNode | StreamParameterNode | FunctionParameterNode | TreeFunctionBodyNode | BodyExpressionNode | SignatureStreamParameterNode | SignatureFunctionParameterNode | SignatureYieldNode;
