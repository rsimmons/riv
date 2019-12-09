import { StreamID, FunctionID } from './Tree';

export interface ConstStreamSpec {
  readonly sid: StreamID;
  readonly val: any;
}

export interface ArrayBuildSpec {
  readonly kind: 'arr';
  readonly sid: StreamID;
  readonly elems: ReadonlyArray<StreamID>;
}

export interface CopySpec {
  readonly kind: 'copy';
  readonly sid: StreamID;
  readonly from: StreamID;
}

export interface ApplicationSpec {
  readonly kind: 'app';
  readonly sids: ReadonlyArray<StreamID>;
  readonly funcId: FunctionID;
  readonly sargIds: ReadonlyArray<StreamID>;
  readonly fargIds: ReadonlyArray<FunctionID>;
}

export type DynStreamSpec = ArrayBuildSpec | CopySpec | ApplicationSpec;

export interface LocalFunctionDefinition {
  readonly fid: FunctionID;
  readonly def: CompiledDefinition;
}

export interface CompiledDefinition {
  readonly paramStreamIds: ReadonlyArray<StreamID>;
  readonly paramFuncIds: ReadonlyArray<FunctionID>;
  readonly constStreams: ReadonlyArray<ConstStreamSpec>;
  readonly dynStreams: ReadonlyArray<DynStreamSpec>;
  readonly localDefs: ReadonlyArray<LocalFunctionDefinition>;
  readonly yieldIds: ReadonlyArray<StreamID>;
}
