import { ExecutionContext } from 'riv-runtime';
import { CompiledDefinition } from './CompiledDefinition';

import { StreamID, FunctionID, Node, FunctionDefinitionNode, NativeFunctionDefinitionNode, TreeFunctionDefinitionNode } from './Tree';

export type NodeEditState = {
  readonly originalNode: Node,
  readonly tentativeNode: Node,
  readonly overwrite: boolean,
} | null;

export interface ClipboardStackFrame {
  readonly mode: 'cut' | 'copy';
  readonly streamId: StreamID;
}

export interface ProgramInfo {
  readonly id: string;
  readonly name: string;
}

export interface SelTree {
  readonly mainDefinition: TreeFunctionDefinitionNode;
  readonly selectedNode: Node;
}

export interface DirectionalLookups {
  parent: ReadonlyMap<Node, Node>;
  prevSibling: ReadonlyMap<Node, Node>;
  nextSibling: ReadonlyMap<Node, Node>;
}

export interface State {
  readonly programInfo: ProgramInfo;
  readonly stableSelTree: SelTree;
  readonly directionalLookups: DirectionalLookups;
  readonly editingSelected: NodeEditState;
  readonly nativeFunctions: ReadonlyArray<NativeFunctionDefinitionNode>;
  /*
  readonly liveMain: {
    context: ExecutionContext;
    compiledDefinition: CompiledDefinition | null;
    updateCompiledDefinition: (newDefinition: CompiledDefinition) => void;
  } | null;
  */
  readonly undoStack: ReadonlyArray<SelTree>;
  readonly clipboardStack: ReadonlyArray<ClipboardStackFrame>;
}
