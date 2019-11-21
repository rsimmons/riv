import { StreamID, FunctionID } from './Tree';

interface UndefinedLiteralSpec {
  readonly kind: 'und';
  readonly sid: StreamID;
}

interface NumberLiteralSpec {
  readonly kind: 'num';
  readonly sid: StreamID;
  readonly val: number;
}

interface ArrayLiteralSpec {
  readonly kind: 'arr';
  readonly sid: StreamID;
  readonly elemIds: ReadonlyArray<StreamID>;
}

interface ParamSpec {
  readonly kind: 'param';
  readonly sid: StreamID;
  readonly idx: number;
}

interface RefSpec {
  readonly kind: 'ref';
  readonly sid: StreamID;
  readonly ref: StreamID;
}

interface AppSpec {
  readonly kind: 'app';
  readonly sids: ReadonlyArray<StreamID>;
  readonly funcId: FunctionID;
  readonly sargIds: ReadonlyArray<StreamID>;
  readonly fargIds: ReadonlyArray<FunctionID>;
}

type StreamSpec = UndefinedLiteralSpec | NumberLiteralSpec | ArrayLiteralSpec | AppSpec;

interface LocalFunctionDefinition {
  readonly fid: FunctionID;
  readonly def: CompiledDefinition;
}

export interface CompiledDefinition {
  streamSpecs: ReadonlyArray<StreamSpec>;
  localDefs: ReadonlyArray<LocalFunctionDefinition>;
  yieldIds: ReadonlyArray<StreamID>;
}
