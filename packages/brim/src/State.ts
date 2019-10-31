import { ExecutionContext } from 'riv-runtime';
import { EssentialDefinition } from './EssentialDefinition';

import { StreamID } from './Identifier';

import { Node, RivFunctionDefinitionNode } from './Tree';
import { RivFunctionDefinition } from './newEssentialDefinition';

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
  readonly mainDefinition: RivFunctionDefinition;
}

export interface State {
  readonly program: Program;
  readonly tree: RivFunctionDefinitionNode;
  readonly selectedNode: Node;
  readonly editingSelected: NodeEditState;
  readonly liveMain: {
    context: ExecutionContext;
    updateCompiledDefinition: (newDefinition: EssentialDefinition) => void;
  } | null;
  readonly undoStack: ReadonlyArray<UndoStackFrame>;
  readonly clipboardStack: ReadonlyArray<ClipboardStackFrame>;
}
