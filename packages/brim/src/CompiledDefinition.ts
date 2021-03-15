import { StreamID, FunctionID, ApplicationID, ParameterID } from './Tree';

export interface ConstStreamSpec {
  readonly sid: StreamID;
  readonly val: any;
}

export interface AppSpec {
  readonly sids: ReadonlyArray<StreamID>; // for return (if any), followed by out-parmeters (if any) in interface order
  readonly appId: ApplicationID;
  readonly funcId: FunctionID;
  readonly args: ReadonlyArray<ParameterID | ReadonlyArray<ParameterID>>; // only in-parameters, with order matching def
  readonly settings?: any;
}

export interface LocalFunctionDefinition {
  readonly fid: FunctionID;
  readonly def: CompiledDefinition;
}

export interface CompiledDefinition {
  readonly paramIds: ReadonlyArray<ParameterID>; // only in-parameters
  readonly constStreams: ReadonlyArray<ConstStreamSpec>;
  readonly apps: ReadonlyArray<AppSpec>; // already toposorted
  readonly localDefs: ReadonlyArray<LocalFunctionDefinition>;
  readonly returnStreamIds: ReadonlyArray<StreamID>; // return (if any), followed by out-parmeters (if any) in interface order
}
