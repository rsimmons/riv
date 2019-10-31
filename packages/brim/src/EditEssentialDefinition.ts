import { StreamID, generateStreamId, FunctionID } from './Identifier';
import { StreamDefinition, RivFunctionDefinition } from './newEssentialDefinition';

interface DeleteStreamDefinitionEdit {
  type: 'delete_stream';
  streamId: StreamID;
}

interface UndefineAppStreamArgumentEdit {
  type: 'undefine_app_stream_argument';
  streamId: StreamID;
  argumentIdx: number;
}

interface DeleteArrayItemEdit {
  type: 'delete_array_item';
  streamId: StreamID;
  itemIdx: number;
}

export type EditBatchItem = DeleteStreamDefinitionEdit | UndefineAppStreamArgumentEdit | DeleteArrayItemEdit;

export interface EditBatch {
  items: ReadonlyArray<EditBatchItem>;
}

export function batchEditRivDefinition(definition: RivFunctionDefinition, editBatch: EditBatch): RivFunctionDefinition {
  const streamIdDef: Map<StreamID, StreamDefinition> = new Map();

  for (const sdef of definition.streamDefinitions) {
    streamIdDef.set(sdef.id, sdef);
  }

  for (const edit of editBatch.items) {
    switch (edit.type) {
      case 'delete_stream':
        streamIdDef.delete(edit.streamId);
        break;

      case 'delete_array_item':
        throw new Error(); // TODO: implement
        /*
        if (sdef.type !== 'arr') {
          throw new Error();
        }
        const newItemIds = sdef.itemIds.slice();
        const deleteIdx = deleteArrayItems.get(sdef.id);
        if (deleteIdx === undefined) {
          throw new Error();
        }
        newItemIds.splice(deleteIdx, 1);
        newStreamDefinitions.push({
          ...sdef,
          itemIds: newItemIds,
        });
        break;
        */

      case 'undefine_app_stream_argument': {
        const newId = generateStreamId();
        streamIdDef.set(newId, {
          type: 'und',
          id: newId,
          desc: null,
        });

        const sdef = streamIdDef.get(edit.streamId);
        if (!sdef || (sdef.type !== 'app')) {
          throw new Error();
        }
        const newStreamArgumentIds = sdef.streamArgumentIds.slice();
        newStreamArgumentIds[edit.argumentIdx] = newId;
        streamIdDef.set(sdef.id, {
          ...sdef,
          streamArgumentIds: newStreamArgumentIds,
        });
        break;
      }

      default:
        throw new Error();
    }
  }

  const newStreamDefinitions = [...streamIdDef.values()];

  return toposortAndDedangle({
    ...definition,
    streamDefinitions: newStreamDefinitions,
  });
}

export class CycleError extends Error {
};

function toposortAndDedangle(definition: RivFunctionDefinition): RivFunctionDefinition {
  const localStreamIdDef: Map<StreamID, StreamDefinition> = new Map();

  for (const sdef of definition.streamDefinitions) {
    localStreamIdDef.set(sdef.id, sdef);
  }

  const dedangleStreamIds = (sids: ReadonlyArray<StreamID>): ReadonlyArray<StreamID> => {
    const newSids: Array<StreamID> = [];
    for (const sid of sids) {
      if (localStreamIdDef.has(sid)) {
        newSids.push(sid);
      } else {
        const newId = generateStreamId();
        console.log('DEDANGLE', newId);
        localStreamIdDef.set(newId, {
          type: 'und',
          id: newId,
          desc: null,
        });
        newSids.push(newId);
      }
    }

    return newSids;
  };

  for (const sdef of localStreamIdDef.values()) {
    switch (sdef.type) {
      case 'und':
      case 'num':
      case 'param':
        // nothing to do
        break;

      case 'arr': {
        localStreamIdDef.set(sdef.id, {
          ...sdef,
          itemIds: dedangleStreamIds(sdef.itemIds),
        });
        break;
      }

      case 'app': {
        localStreamIdDef.set(sdef.id, {
          ...sdef,
          streamArgumentIds: dedangleStreamIds(sdef.streamArgumentIds),
        });
        break;
      }

      default:
        throw new Error();
    }
  }

  // Using terminology from https://en.wikipedia.org/wiki/Topological_sorting#Depth-first_search
  const temporaryMarkedStreamIds: Set<StreamID> = new Set();
  const permanentMarkedStreamIds: Set<StreamID> = new Set();
  const sortedStreamDefinitions: Array<StreamDefinition> = [];

  const visitStreamDefinition = (sdef: StreamDefinition): void => {
    if (permanentMarkedStreamIds.has(sdef.id)) {
      return;
    }
    if (temporaryMarkedStreamIds.has(sdef.id)) {
      throw new CycleError('stream id ' + sdef.id);
    }

    switch (sdef.type) {
      case 'und':
      case 'num':
      case 'param':
        // nothing to do
        break;

      case 'arr':
        throw new Error(); // TODO: implement

      case 'app':
        temporaryMarkedStreamIds.add(sdef.id);
        for (const argId of sdef.streamArgumentIds) {
          const argDef = localStreamIdDef.get(argId);
          if (argDef === undefined) {
            throw new Error();
          }
          visitStreamDefinition(argDef);
        }
        temporaryMarkedStreamIds.delete(sdef.id);
        break;

      default:
        throw new Error();
    }

    sortedStreamDefinitions.push(sdef);
    permanentMarkedStreamIds.add(sdef.id);
  };

  // Initiate DFS from each stream expression
  for (const sdef of localStreamIdDef.values()) {
    visitStreamDefinition(sdef);
  }

  return {
    ...definition,
    streamDefinitions: sortedStreamDefinitions,
  };
}
