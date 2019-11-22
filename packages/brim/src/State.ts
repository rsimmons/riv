import { ExecutionContext } from 'riv-runtime';
import { CompiledDefinition } from './CompiledDefinition';

import { StreamID, FunctionID, Node, FunctionDefinitionNode, NativeFunctionDefinitionNode, TreeFunctionDefinitionNode } from './Tree';

export type NodeEditState = {
  readonly originalNode: Node,
  readonly tentativeNode: Node,
  readonly overwrite: boolean,
} | null;

export interface UndoStackFrame {
  readonly program: Program;
  readonly selectedNode: Node;
};

export interface ClipboardStackFrame {
  readonly mode: 'cut' | 'copy';
  readonly streamId: StreamID;
}

export interface Program {
  readonly programId: string;
  readonly name: string;
  readonly mainDefinition: TreeFunctionDefinitionNode;
}

export interface DirectionalLookups {
  parent: ReadonlyMap<Node, Node>;
  prevSibling: ReadonlyMap<Node, Node>;
  nextSibling: ReadonlyMap<Node, Node>;
}

export interface DerivedLookups {
  // streamIdToNode: ReadonlyMap<StreamID, StreamCreationNode> | null;
  functionIdToDef: ReadonlyMap<FunctionID, FunctionDefinitionNode> | null;
  directional: DirectionalLookups;
}

export interface State {
  readonly program: Program;
  readonly selectedNode: Node;
  readonly editingSelected: NodeEditState;
  readonly nativeFunctions: ReadonlyArray<NativeFunctionDefinitionNode>;
  readonly derivedLookups: DerivedLookups;
  /*
  readonly liveMain: {
    context: ExecutionContext;
    compiledDefinition: CompiledDefinition | null;
    updateCompiledDefinition: (newDefinition: CompiledDefinition) => void;
  } | null;
  */
  readonly undoStack: ReadonlyArray<UndoStackFrame>;
  readonly clipboardStack: ReadonlyArray<ClipboardStackFrame>;
}
