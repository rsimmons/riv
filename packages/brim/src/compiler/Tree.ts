/**
 * IDS
 */
export type UID = string;

/**
 * NODE KINDS
 */
export enum NodeKind {
  // general
  Text = 'text',

  // literals
  UndefinedLiteral = 'und',
  NumberLiteral = 'num',
  TextLiteral = 'str',
  BooleanLiteral = 'bool',

  // other stream expression nodes
  StreamReference = 'sref',
  Application = 'app',

  // binding expressions
  NameBinding = 'nbind',

  // function interfaces
  FunctionName = 'fname',
  StreamParam = 'sparam',
  FunctionParam = 'fparam',
  FunctionInterface = 'fint',

  // functions implementations, definitions
  NativeImpl = 'nimpl',
  StreamBinding = 'sbind',
  TreeImpl = 'timpl',
  FunctionDefinition = 'fdef',

  // types
  ValueTypeApp = 'vtyapp',
  ValueTypeVar = 'vtyvar',
}

/**
 * GENERAL
 */

export interface TextNode {
  readonly kind: NodeKind.Text;
  readonly nid: UID;
  readonly text: string;
}

/**
 * LITERALS
 */
export interface UndefinedLiteralNode {
  readonly kind: NodeKind.UndefinedLiteral;
  readonly nid: UID;
}

export interface NumberLiteralNode {
  readonly kind: NodeKind.NumberLiteral;
  readonly nid: UID;
  readonly val: number;
}

export interface TextLiteralNode {
  readonly kind: NodeKind.TextLiteral;
  readonly nid: UID;
  readonly val: string;
}

export interface BooleanLiteralNode {
  readonly kind: NodeKind.BooleanLiteral;
  readonly nid: UID;
  readonly val: boolean;
}

export type SimpleLiteralNode = UndefinedLiteralNode | NumberLiteralNode | TextLiteralNode | BooleanLiteralNode;
export function isSimpleLiteralNode(node: Node): node is SimpleLiteralNode {
  return (node.kind === NodeKind.UndefinedLiteral) || (node.kind === NodeKind.NumberLiteral) || (node.kind === NodeKind.TextLiteral) || (node.kind === NodeKind.BooleanLiteral);
}

/**
 * OTHER STREAM EXPRESSION NODES
 */
export interface StreamReferenceNode {
  readonly kind: NodeKind.StreamReference;
  readonly nid: UID;
  readonly ref: UID; // the stream we are referencing
}

export type ApplicationArgNode = StreamExpressionNode | FunctionDefinitionNode;
export function isApplicationArgNode(node: Node): node is ApplicationArgNode {
  return isStreamExpressionNode(node) || (node.kind === NodeKind.FunctionDefinition);
}

export type ApplicationSettings = any;
export type ApplicationArgs = ReadonlyMap<UID, ApplicationArgNode>;

export interface ApplicationNode {
  readonly kind: NodeKind.Application;
  readonly nid: UID; // output (if any) goes into this stream id
  readonly fid: UID; // function being applied
  readonly args: ApplicationArgs; // includes both stream and function args
  readonly settings?: ApplicationSettings;
}

export type StreamExpressionNode = SimpleLiteralNode | StreamReferenceNode | ApplicationNode;
export function isStreamExpressionNode(node: Node): node is StreamExpressionNode {
  return isSimpleLiteralNode(node) || (node.kind === NodeKind.StreamReference) || (node.kind === NodeKind.Application);
}

/**
 * BINDING EXPRESSIONS
 */

export interface NameBindingNode {
  readonly kind: NodeKind.NameBinding;
  readonly nid: UID;
  readonly name: TextNode;
  // TODO: type
}

export type BindingExpressionNode = NameBindingNode;
export function isBindingExpressionNode(node: Node): node is BindingExpressionNode {
  return (node.kind === NodeKind.NameBinding);
}


/**
 * FUNCTION INTERFACES
 */

export interface StreamParamNode {
  readonly kind: NodeKind.StreamParam;
  readonly nid: UID; // this doubles as the id used to identify parameters in applications
  readonly bind: NameBindingNode;
}

export interface FunctionParamNode {
  readonly kind: NodeKind.FunctionParam;
  readonly nid: UID; // this doubles as the id used to identify parameters in applications
  readonly iface: FunctionInterfaceNode;
}

export type ParamNode = StreamParamNode | FunctionParamNode;
export function isParamNode(node: Node): node is ParamNode {
  return (node.kind === NodeKind.StreamParam) || (node.kind === NodeKind.FunctionParam);
}

export interface FunctionInterfaceNode {
  readonly kind: NodeKind.FunctionInterface;
  readonly nid: UID; // this is the function id associated with this interface
  readonly name: TextNode;
  readonly params: ReadonlyArray<ParamNode>;
  readonly output: boolean; // this will eventually become a type?
  // readonly customTmpl?: FunctionTemplateNode;
  // readonly createCustomUI?: (underNode: HTMLElement, settings: ApplicationSettings, onChange: (change: ApplicationSettings) => void) => (() => void); // returns "shutdown" closure
}

/**
 * FUNCTION IMPLEMENATIONS, DEFINITIONS
 */

export interface NativeImplNode {
  readonly kind: NodeKind.NativeImpl;
  readonly nid: UID;
  // TODO: JS code as string?
  readonly impl: Function; // JS function for now
}

export interface StreamBindingNode {
  readonly kind: NodeKind.StreamBinding;
  readonly nid: UID;
  readonly bexpr: BindingExpressionNode; // LHS
  readonly sexpr: StreamExpressionNode; // RHS
}

export type TreeImplBodyNode = StreamExpressionNode | StreamBindingNode | FunctionDefinitionNode;
export function isTreeImplBodyNode(node: Node): node is TreeImplBodyNode {
  return isStreamExpressionNode(node) || (node.kind === NodeKind.StreamBinding) || (node.kind === NodeKind.FunctionDefinition);
}

export interface TreeImplNode {
  readonly kind: NodeKind.TreeImpl;
  readonly nid: UID;
  // pids maps nid of function interface param to the internal id
  readonly pids: ReadonlyMap<UID, UID>;
  readonly body: ReadonlyArray<TreeImplBodyNode>;
  readonly out: StreamExpressionNode | null;
}

export type FunctionImplNode = NativeImplNode | TreeImplNode;
export function isFunctionImplNode(node: Node): node is FunctionImplNode {
  return (node.kind === NodeKind.NativeImpl) || (node.kind === NodeKind.TreeImpl);
}

export interface FunctionDefinitionNode {
  readonly kind: NodeKind.FunctionDefinition;
  readonly nid: UID;
  readonly iface: FunctionInterfaceNode;
  readonly impl: FunctionImplNode;
}

/**
 * TYPES
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
 * NODE UNION TYPE
 */

export type Node = TextNode | StreamExpressionNode | BindingExpressionNode | ParamNode | FunctionInterfaceNode | StreamBindingNode | FunctionImplNode | FunctionDefinitionNode;
