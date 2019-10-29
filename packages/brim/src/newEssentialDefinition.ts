import { StreamID, FunctionID } from './Identifier';
import { FunctionSignature } from './Signature';

type MaybeDescription = string | null;

export interface UndefinedLiteralStreamDefinition {
  readonly type: 'und';
  readonly id: StreamID;
  readonly desc: MaybeDescription;
}

export interface NumberLiteralStreamDefinition {
  readonly type: 'num';
  readonly id: StreamID;
  readonly desc: MaybeDescription;
  readonly value: number;
}

export interface ArrayLiteralStreamDefinition {
  readonly type: 'arr';
  readonly id: StreamID;
  readonly desc: MaybeDescription;
  readonly itemIds: ReadonlyArray<StreamID>;
}

export interface ApplicationStreamDefinition {
  readonly type: 'app';
  readonly id: StreamID;
  readonly desc: MaybeDescription;
  readonly appliedFunctionId: FunctionID;
  readonly streamArgumentIds: ReadonlyArray<StreamID>;
  readonly functionArgumentIds: ReadonlyArray<FunctionID>;
}

export interface ParameterStreamDefinition {
  readonly type: 'param';
  readonly id: StreamID;
  readonly desc: MaybeDescription;
  readonly position: number;
}

export type StreamDefinition = UndefinedLiteralStreamDefinition | NumberLiteralStreamDefinition | ApplicationStreamDefinition | ArrayLiteralStreamDefinition | ParameterStreamDefinition;

export interface RivFunctionDefinition {
  readonly type: 'riv';
  readonly id: FunctionID;
  readonly desc: MaybeDescription;
  readonly signature: FunctionSignature;

  // local definitions
  readonly streamDefinitions: ReadonlyArray<StreamDefinition>;
  readonly functionDefinitions: ReadonlyArray<FunctionDefinition>;

  readonly yieldStreamId: StreamID | null;
}

export interface NativeFunctionDefinition {
  readonly type: 'native';
  readonly id: FunctionID;
  readonly desc: MaybeDescription;
  readonly signature: FunctionSignature;

  readonly jsFunc: Function; // TODO: I think this eventually gets replaced by code to be eval'd
}

export type FunctionDefinition = RivFunctionDefinition | NativeFunctionDefinition;
