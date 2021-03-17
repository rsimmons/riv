import genuid from '../util/uid';
import { Stream } from 'stream';

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
  StreamReference = 'sref',
  Application = 'app',
  ApplicationOut = 'appout',
  NativeFunctionDefinition = 'nfdef',
  YieldExpression = 'yield',
  ValueTypeApp = 'vtyapp',
  ValueTypeVar = 'vtyvar',
  FIStreamParam = 'fisparam',
  FIFunctionParam = 'fifparam',
  FIOutParam = 'fioparam',
  FIReturn = 'firet',
  FIVoid = 'fivoid',
  FunctionInterface = 'fiface',
  TreeFunctionDefinition = 'tfdef',
}

/**
 * COMMON NODES
 */
export interface TextNode {
  readonly text: string;
}

export interface NameNode extends TextNode {
  readonly kind: NodeKind.Name;
  // gets "text" field from TextNode
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

export interface StreamReferenceNode {
  readonly kind: NodeKind.StreamReference;
  readonly ref: StreamID; // the stream id we are referencing
}

// This is the only way that local streams (other than parameters) get bound to names
export interface ApplicationOutNode extends TextNode {
  readonly kind: NodeKind.ApplicationOut;
  readonly sid: StreamID;
  // gets "text" field from TextNode
}

export type ApplicationArgNode = StreamExpressionNode | FunctionDefinitionNode | ApplicationOutNode;
export function isApplicationArgNode(node: Node): node is ApplicationArgNode {
  return isStreamExpressionNode(node) || isFunctionDefinitionNode(node) || (node.kind === NodeKind.ApplicationOut);
}

export type ApplicationSettings = any;
export type ApplicationArgs = ReadonlyMap<ParameterID, ApplicationArgNode>;

export interface ApplicationNode {
  readonly kind: NodeKind.Application;
  readonly aid: ApplicationID;
  readonly fid: FunctionID; // function being applied
  readonly args: ApplicationArgs; // includes out-arguments
  readonly rid: StreamID | undefined; // id that we put return into, or undefined if void
  readonly settings?: ApplicationSettings;
}

// Stream parameter definitions (on the "inside" of a function def) are _not_ expressions.
export type StreamExpressionNode = SimpleLiteralNode | StreamReferenceNode | ApplicationNode;
export function isStreamExpressionNode(node: Node): node is StreamExpressionNode {
  return isSimpleLiteralNode(node) || (node.kind === NodeKind.StreamReference) || (node.kind === NodeKind.Application);
}

/**
 * TYPE DECLARATION NODES
 */

/*
export interface ValueTypeAppNode {
  readonly kind: NodeKind.ValueTypeApp;
  readonly ctor: string;
  readonly args: ReadonlyArray<ValueTypeNode>;
}

export interface ValueTypeVarNode {
  readonly kind: NodeKind.ValueTypeVar;
}

export type ValueTypeNode = ValueTypeAppNode | ValueTypeVarNode;
*/

/**
 * FUNCTION INTERFACE NODES
 */

export type ParameterID = StreamID | FunctionID;

export interface FIStreamParamNode {
  readonly kind: NodeKind.FIStreamParam;
  readonly pid: StreamID;
  readonly name: NameNode;
  // TODO: type
}

export interface FIFunctionParamNode {
  readonly kind: NodeKind.FIFunctionParam;
  readonly pid: FunctionID;
  readonly name: NameNode;
  readonly iface: FunctionInterfaceNode;
}

export interface FIOutParamNode {
  readonly kind: NodeKind.FIOutParam;
  readonly pid: StreamID;
  readonly name: NameNode;
  // TODO: type
}

export type FIParamNode = FIStreamParamNode | FIFunctionParamNode | FIOutParamNode;
export function isFIParamNode(node: Node): node is FIParamNode {
  return (node.kind === NodeKind.FIStreamParam) || (node.kind === NodeKind.FIFunctionParam) || (node.kind === NodeKind.FIOutParam);
}

export interface FIReturnNode {
  readonly kind: NodeKind.FIReturn;
  // TODO: type
}

// this is like "void"
export interface FIVoidNode {
  readonly kind: NodeKind.FIVoid;
}

export interface FunctionInterfaceNode {
  readonly kind: NodeKind.FunctionInterface;
  readonly name: NameNode;
  readonly params: ReadonlyArray<FIParamNode>;
  readonly ret: FIReturnNode | FIVoidNode;
  readonly customTmpl?: NameNode;
  readonly createCustomUI?: (underNode: HTMLElement, settings: ApplicationSettings, onChange: (change: ApplicationSettings) => void) => (() => void); // returns "shutdown" closure
}

/**
 * FUNCTION NODES
 */


export interface NativeFunctionDefinitionNode {
  readonly kind: NodeKind.NativeFunctionDefinition;
  readonly fid: FunctionID;
  readonly iface: FunctionInterfaceNode;

  // TODO: JS code as string?
  readonly impl: Function;
}

export interface YieldExpressionNode {
  readonly kind: NodeKind.YieldExpression;
  readonly out: StreamID | null; // if null, this is the return yield, if StreamID, it is the ParameterID of an out-param
  readonly expr: StreamExpressionNode;
}

export type BodyExpressionNode = StreamExpressionNode | FunctionDefinitionNode | YieldExpressionNode;
export function isBodyExpressionNode(node: Node): node is BodyExpressionNode {
  return isStreamExpressionNode(node) || isFunctionDefinitionNode(node) || (node.kind === NodeKind.YieldExpression);
}

export interface TreeFunctionDefinitionNode {
  readonly kind: NodeKind.TreeFunctionDefinition;
  readonly fid: FunctionID;
  readonly iface: FunctionInterfaceNode;

  readonly bodyExprs: ReadonlyArray<BodyExpressionNode>;
}

export type FunctionDefinitionNode = NativeFunctionDefinitionNode | TreeFunctionDefinitionNode;
export function isFunctionDefinitionNode(node: Node): node is FunctionDefinitionNode {
  return (node.kind === NodeKind.NativeFunctionDefinition) || (node.kind === NodeKind.TreeFunctionDefinition);
}

export type Node = NameNode | BodyExpressionNode | ApplicationOutNode | FunctionInterfaceNode | FIParamNode | FIReturnNode | FIVoidNode;
