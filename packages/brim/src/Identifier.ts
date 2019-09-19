import genuid from './uid';

export type StreamID = string;
export type FunctionID = string;
export type AnyID = StreamID | FunctionID;

const STREAM_PREFIX = 'S-';
export function generateStreamId(): StreamID {
  return STREAM_PREFIX + genuid();
}
export function isStreamId(s: string): s is StreamID {
  return s.startsWith(STREAM_PREFIX);
}

const FUNCTION_PREFIX = 'F-';
export function generateFunctionId(): FunctionID {
  return FUNCTION_PREFIX + genuid();
}
export function isFunctionId(s: string): s is FunctionID {
  return s.startsWith(FUNCTION_PREFIX);
}

