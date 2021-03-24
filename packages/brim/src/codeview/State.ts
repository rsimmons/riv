import { ExecutionContext } from 'riv-runtime';
import { CompiledDefinition } from '../compiler/CompiledDefinition';

import { UID, Node, FunctionDefinitionNode } from '../compiler/Tree';

export interface ClipboardStackFrame {
  readonly mode: 'cut' | 'copy';
  readonly streamId: UID;
}

export interface ProgramInfo {
  readonly id: string;
  readonly name: string;
}

export interface SelTree {
  readonly mainDef: FunctionDefinitionNode;
  readonly selectedNode: Node;
}

interface EditState {
  sessionId: string; // lets us "reset" chooser when we jump to editing a different thing
  initSelTree: SelTree; // initial when this "session" (current node) began, not initial of chain of edits
  curSelTree: SelTree;
  compileError: string | undefined;
  isInsert: boolean; // was this session an insert into an array-like?
  infixMode: boolean; // treat initSelTree.selectedNode as being the first arg to an infix/postfix function we will choose
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
  readonly globalFunctions: ReadonlyArray<FunctionDefinitionNode>;
  readonly undoStack: ReadonlyArray<SelTree>;
  readonly clipboardStack: ReadonlyArray<ClipboardStackFrame>;
  readonly execution: ExecutionState | null;
}
