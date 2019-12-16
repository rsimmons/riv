import { ExecutionContext } from 'riv-runtime';
import { CompiledDefinition } from './CompiledDefinition';

import { StreamID, Node, NativeFunctionDefinitionNode, TreeFunctionDefinitionNode } from './Tree';

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

interface EditState {
  origSelTree: SelTree;
  curSelTree: SelTree;
}

export interface State {
  readonly programInfo: ProgramInfo;
  readonly stableSelTree: SelTree;
  readonly editing: EditState | null;
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
