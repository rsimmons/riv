export type StreamID = string;
export type FunctionID = string;

export interface ProgramNode {
  type: 'Program';
  expressions: ExpressionNode[];
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
  arguments: ExpressionNode[];
}
export function isApplicationNode(node: Node): node is ApplicationNode {
  return node.type === 'Application';
}

export type ExpressionNode = UndefinedExpressionNode | IntegerLiteralNode | ArrayLiteralNode | StreamReferenceNode | ApplicationNode;
export function isExpressionNode(node: Node): node is ExpressionNode {
  return isUndefinedExpressionNode(node)
    || isIntegerLiteralNode(node)
    || isArrayLiteralNode(node)
    || isStreamReferenceNode(node)
    || isApplicationNode(node);
}

export interface ExternalFunctionNode {
  type: 'ExternalFunction',
  functionId: FunctionID,
  identifier: IdentifierNode | null;
  parameters: Array<string>; // just the names for now
  jsFunction: Function; // the actual callable JS function
}
export function isExternalFunctionNode(node: Node): node is ExternalFunctionNode {
  return node.type === 'ExternalFunction';
}

export type FunctionNode = ExternalFunctionNode;
export function isFunctionNode(node: Node): node is FunctionNode {
  return isExternalFunctionNode(node);
}

export type Node = ProgramNode | IdentifierNode | ExpressionNode | ExternalFunctionNode;
export function isNode(node: any): node is Node {
  return isProgramNode(node) || isIdentifierNode(node) || isExpressionNode(node) || isExternalFunctionNode(node);
}

export type Path = (string | number)[];

export interface State {
  root: ProgramNode;
  selectionPath: Path;
  editingSelected: boolean;
  externalFunctions: Array<ExternalFunctionNode>;
  derivedLookups: {
    streamIdToNode: Map<StreamID, ExpressionNode>;
    nameToNodes: Map<string, Node[]>;
    functionIdToNode: Map<FunctionID, ExternalFunctionNode>;
    nameToFunctions: Map<string, Node[]>;
  } | undefined;
}
