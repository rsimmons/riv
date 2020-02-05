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
  sessionId: string; // lets us "reset" chooser when we jump to editing a different thing
  initSelTree: SelTree; // initial when this "session" (current node) began, not initial of chain of edits
  curSelTree: SelTree;
  compileError: string | undefined;
  isInsert: boolean; // was this session an insert into an array-like?
}

interface ExecutionState {
  context: ExecutionContext;
  compiledDefinition: CompiledDefinition | null;
  updateCompiledDefinition: (newDefinition: CompiledDefinition) => void;
}

export interface State {
  readonly programInfo: ProgramInfo;
  readonly stableSelTree: SelTree;
  readonly editing: EditState | null;
  readonly nativeFunctions: ReadonlyArray<NativeFunctionDefinitionNode>;
  readonly undoStack: ReadonlyArray<SelTree>;
  readonly clipboardStack: ReadonlyArray<ClipboardStackFrame>;
  readonly execution: ExecutionState | null;
}
