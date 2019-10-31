import { StreamID } from './Identifier';
import { StreamDefinition, RivFunctionDefinition } from './newEssentialDefinition';

interface DeleteStreamDefinitionEdit {
  type: 'delete_stream';
  streamId: StreamID;
}

interface ChangeStreamDefinitionEdit {
  type: 'change_stream';
  streamId: StreamID;
  newDefinition: StreamDefinition;
}

export type EditBatchItem = DeleteStreamDefinitionEdit | ChangeStreamDefinitionEdit;

export interface EditBatch {
  items: ReadonlyArray<EditBatchItem>;
}

export function batchEditRivDefinition(definition: RivFunctionDefinition, editBatch: EditBatch): RivFunctionDefinition {
  return definition;
}
