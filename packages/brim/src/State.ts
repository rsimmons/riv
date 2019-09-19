import { ExecutionContext } from 'riv-runtime';
import { EssentialDefinition } from './EssentialDefinition';

import { StreamID, FunctionID } from './Identifier';

import { Node, ProgramNode, NativeFunctionDefinitionNode, StreamDefinitionNode, FunctionDefinitionNode } from './Tree';

export function pathIsPrefix(a: Path, b: Path): boolean {
  if (a.length > b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
}

export type Path = ReadonlyArray<number>;

export type NodeEditState = {
  readonly originalNode: Node,
  readonly tentativeNode: Node,
} | null;

export interface UndoStackFrame {
  readonly program: ProgramNode;
  readonly selectionPath: Path;
};

export interface ClipboardStackFrame {
  readonly mode: 'cut' | 'copy';
  readonly streamId: StreamID;
}

export interface State {
  readonly program: ProgramNode;
  readonly selectionPath: Path;
  readonly editingSelected: NodeEditState;
  readonly nativeFunctions: ReadonlyArray<NativeFunctionDefinitionNode>;
  readonly derivedLookups: {
    streamIdToNode: ReadonlyMap<StreamID, StreamDefinitionNode> | null;
    functionIdToNode: ReadonlyMap<FunctionID, FunctionDefinitionNode> | null;
    nodeToPath: ReadonlyMap<Node, Path> | null;
  };
  readonly liveMain: {
    context: ExecutionContext;
    compiledDefinition: EssentialDefinition | null;
    updateCompiledDefinition: (newDefinition: EssentialDefinition) => void;
  } | null;
  readonly undoStack: ReadonlyArray<UndoStackFrame>;
  readonly clipboardStack: ReadonlyArray<ClipboardStackFrame>;
}
