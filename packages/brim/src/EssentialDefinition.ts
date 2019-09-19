import { StreamID, FunctionID, AnyID } from './Identifier';

export interface EssentialDefinition {
  parameters: Array<{ // either streams or functions
    id: AnyID,
  }>;
  constantStreamValues: Array<{
    streamId: StreamID,
    value: any,
  }>;
  applications: Array<{
    resultStreamId: StreamID,
    appliedFunction: FunctionID,
    argumentIds: Array<AnyID>, // either streams or functions
  }>;
  containedFunctionDefinitions: Array<{
    id: FunctionID,
    definition: EssentialDefinition,
  }>;
  yieldStreamId: StreamID | null;
  externalReferencedStreamIds: Set<StreamID>;
  externalReferencedFunctionIds: Set<FunctionID>;
}
