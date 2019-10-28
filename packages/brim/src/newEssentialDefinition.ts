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

export const SAMPLE_DEFINITION: RivFunctionDefinition = {
  type: 'riv',
  id: 'F-1',
  desc: 'main',
  signature: {
    streamParameters: [],
    functionParameters: [],
    yields: false,
  },
  streamDefinitions: [
    {
      type: 'app',
      id: 'S-1',
      desc: 'md',
      appliedFunctionId: 'mouseDown',
      streamArgumentIds: [],
      functionArgumentIds: [],
    },
    {
      type: 'num',
      id: 'S-2',
      desc: null,
      value: 10,
    },
    {
      type: 'num',
      id: 'S-3',
      desc: null,
      value: 20,
    },
    {
      type: 'app',
      id: 'S-4',
      desc: null,
      appliedFunctionId: 'ifte',
      streamArgumentIds: ['S-1', 'S-2', 'S-3'],
      functionArgumentIds: [],
    },
    {
      type: 'app',
      id: 'S-5',
      desc: null,
      appliedFunctionId: 'showString',
      streamArgumentIds: ['S-4'],
      functionArgumentIds: [],
    },
    {
      type: 'app',
      id: 'S-6',
      desc: null,
      appliedFunctionId: 'showString',
      streamArgumentIds: ['S-1'],
      functionArgumentIds: [],
    },
  ],
  functionDefinitions: [],
  yieldStreamId: null,
};
