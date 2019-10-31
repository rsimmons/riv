import { StreamID, generateStreamId } from './Identifier';
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
  const deleteStreamIds: Set<StreamID> = new Set();
  for (const edit of editBatch.items) {
    switch (edit.type) {
      case 'delete_stream':
        deleteStreamIds.add(edit.streamId);
        break;

      default:
        throw new Error();
    }
  }

  const newStreamDefinitions: Array<StreamDefinition> = [];
  for (const sdef of definition.streamDefinitions) {
    if (!deleteStreamIds.has(sdef.id)) {
      newStreamDefinitions.push(sdef);
    }
  }

  return resolveDanglingReferences({
    ...definition,
    streamDefinitions: newStreamDefinitions,
  });
}

function resolveDanglingReferences(definition: RivFunctionDefinition): RivFunctionDefinition {
  const definedStreamIds: Set<StreamID> = new Set();

  const newStreamDefinitions: Array<StreamDefinition> = [];

  const handleStreamIds = (sids: ReadonlyArray<StreamID>): ReadonlyArray<StreamID> => {
    const newSids: Array<StreamID> = [];
    for (const sid of sids) {
      if (definedStreamIds.has(sid)) {
        newSids.push(sid);
      } else {
        const newId = generateStreamId();
        newStreamDefinitions.push({
          type: 'und',
          id: newId,
          desc: null,
        });
        definedStreamIds.add(newId);
        newSids.push(newId);
      }
    }

    return newSids;
  };

  for (const sdef of definition.streamDefinitions) {
    switch (sdef.type) {
      case 'und':
      case 'num':
      case 'param':
        newStreamDefinitions.push(sdef);
        definedStreamIds.add(sdef.id);
        break;

      case 'arr': {
        newStreamDefinitions.push({
          ...sdef,
          itemIds: handleStreamIds(sdef.itemIds),
        });
        definedStreamIds.add(sdef.id);
        break;
      }

      case 'app': {
        newStreamDefinitions.push({
          ...sdef,
          streamArgumentIds: handleStreamIds(sdef.streamArgumentIds),
        });
        definedStreamIds.add(sdef.id);
        break;
      }
    }
  }

  return {
    ...definition,
    streamDefinitions: newStreamDefinitions,
  };
}
