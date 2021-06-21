import { UID } from './Tree';

export interface ConstStreamSpec {
  readonly sid: UID;
  readonly val: any;
}

export interface AppSpec {
  readonly aid: UID; // uniquely identifies this application
  readonly fid: UID; // applied function
  readonly args: ReadonlyArray<UID | ReadonlyArray<UID>>; // note that settings may be first arg
  readonly oid: UID | null; // stream id that we store output value in (if there is any)
}

export interface CompiledDefinition {
  readonly fid: UID; // function id created by this definition
  readonly pids: ReadonlyArray<UID>; // internal stream and function ids that params are assigned to
  readonly consts: ReadonlyArray<ConstStreamSpec>;
  readonly apps: ReadonlyArray<AppSpec>; // already toposorted
  readonly defs: ReadonlyArray<CompiledDefinition>; // local contained definitions
  readonly oid: UID | null; // stream id that it outputted (if there is output)
  readonly orefs: ReadonlyArray<UID>; // ids referenced in outer scopes
}
