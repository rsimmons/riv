import { StreamID, FunctionID } from './Tree';

export interface ConstStreamSpec {
  readonly sid: StreamID;
  readonly val: any;
}

export interface AppStreamSpec {
  readonly sids: ReadonlyArray<StreamID>;
  readonly funcId: FunctionID;
  readonly sargIds: ReadonlyArray<StreamID>;
  readonly fargIds: ReadonlyArray<FunctionID>;
}

export interface LocalFunctionDefinition {
  readonly fid: FunctionID;
  readonly def: CompiledDefinition;
}

export interface CompiledDefinition {
  readonly paramStreamIds: ReadonlyArray<StreamID>;
  readonly paramFuncIds: ReadonlyArray<FunctionID>;
  readonly constStreams: ReadonlyArray<ConstStreamSpec>;
  readonly appStreams: ReadonlyArray<AppStreamSpec>;
  readonly localDefs: ReadonlyArray<LocalFunctionDefinition>;
  readonly yieldIds: ReadonlyArray<StreamID>;
}
