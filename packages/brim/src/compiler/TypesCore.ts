import { TypeCtorInfo } from "./Types";

export const CORE_TYPES: ReadonlyArray<TypeCtorInfo> = [
  // tempos
  {
    tid: 'step',
    arity: 1,
  },

  {
    tid: 'event',
    arity: 1,
  },

  // base (kind *)
  {
    tid: 'number',
    arity: 0,
  },

  {
    tid: 'text', // aka string
    arity: 0,
  },

  {
    tid: 'boolean',
    arity: 0,
  },

  {
    tid: 'nothing', // aka unit
    arity: 0,
  },

  {
    tid: 'bytes', // aka byte array, binary. internally an ArrayBuffer
    arity: 0,
  },

  // higher kinds
  {
    tid: 'list',
    arity: 1,
  },
];
