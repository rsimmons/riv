import genuid from './uid';
import { useVar, useInitialize } from 'riv-runtime';

// NOTE: This is just a stub for now
class ExecutionContext {
  constructor(updateFunc: Function, onRequestUpdate: () => void) {
  }

  update(...args: any[]): any {
  }

  _setStreamFunc(func: Function): void {
  }

  terminate(): void {
  }
}

interface ActivationStreamContextsStreamInfo {
  updateFunc: Function;
  onRequestUpdate: () => void;
  activationContexts: Map<string, ExecutionContext>;
};

class ActivationStreamContexts {
  private streamInfo: Map<string, ActivationStreamContextsStreamInfo>;
  private activationIds: Set<string>;

  constructor() {
    this.streamInfo = new Map();
    this.activationIds = new Set();
  }

  /**
   * Add a context for this stream for each activation
   */
  addContext(streamId: string, updateFunc: Function, onRequestUpdate: () => void) {
    const activationContexts = new Map();
    this.activationIds.forEach(aid => {
      activationContexts.set(aid, new ExecutionContext(updateFunc, onRequestUpdate));
    });

    this.streamInfo.set(streamId, {
      updateFunc,
      onRequestUpdate,
      activationContexts,
    });
  }

  /**
   * Remove the contexts for this stream for all activations
   */
  removeContext(streamId: string) {
    const info = this.streamInfo.get(streamId);
    if (!info) {
      throw new Error();
    }
    info.activationContexts.forEach(context => {
      context.terminate();
    });
    this.streamInfo.delete(streamId);
  }

  addActivation(activationId: string) {
    this.streamInfo.forEach(info => {
      info.activationContexts.set(activationId, new ExecutionContext(info.updateFunc, info.onRequestUpdate));
    });
  }

  removeActivation(activationId: string) {
    this.streamInfo.forEach(info => {
      const context = info.activationContexts.get(activationId);
      if (!context) {
        throw new Error();
      }
      context.terminate();
      info.activationContexts.delete(activationId);
    });
  }

  getContext(activationId: string, streamId: string): ExecutionContext {
    const info = this.streamInfo.get(streamId);
    if (!info) {
      throw new Error();
    }
    const context = info.activationContexts.get(activationId);
    if (!context) {
      throw new Error();
    }
    return context;
  }

  terminateAll() {
    // TODO: implement. terminate all contexts (all activations, all streams)
    throw new Error();
  }
}

interface CompiledDefinition {
  constantStreamValues: [string, any][];
  updates: [string, Function, string[]][]; // streamId, updateFunc, argStreamIds
}

/*
Say we have the expression "display(add(time(), 10))". The call to display is an expression node, with streamId 'S1'. The call to add is an expression node with streamId 'S2'. The call to time is an expression node with streamId 'S3'. The literal 10 is a node with streamId 'S4'.

const compiledDefinition = {
  constantStreamValues: [
    ['S4', 10],
  ],
  updates: [
    ['S3', time, []],
    ['S2', add, ['S3', 'S4']],
    ['S1', display, ['S2']],
  ]
};
*/

function createLiveUpdateFunc(compiledDefinition: CompiledDefinition, activationStreamContexts: ActivationStreamContexts) {
  return () => {
    // compiledDefinition: CompiledDefinition is referenced via closure
    const {constantStreamValues, updates} = compiledDefinition;
    const activationId = useVar('');
    useInitialize(() => {
      const actId = genuid();
      activationId.current = actId;
      activationStreamContexts.addActivation(actId);
      return () => {
        activationStreamContexts.removeActivation(actId);
      };
    });
    const streamValues = new Map(constantStreamValues); // clone
    for (const [sid, func, argIds] of updates) {
      const argVals = argIds.map(id => streamValues.get(id));
      const context = activationStreamContexts.getContext(activationId.current, sid);
      context._setStreamFunc(func);
      streamValues.set(sid, context.update(...argVals));
    }
  }
}

interface FunctionDefinitionRecord {
  compiledDefinition: CompiledDefinition;
  activationStreamContexts: ActivationStreamContexts;
}

export default class LiveRunner {
  private functionDefinitionInfo: Map<string, FunctionDefinitionRecord>;

  constructor() {
    this.functionDefinitionInfo = new Map();
  }

  addFunctionDefinition(functionId: string, compiledDefinition: CompiledDefinition): void {
  }

  removeFunctionDefinition(functionId: string): void {
    const info = this.functionDefinitionInfo.get(functionId);
    if (!info) {
      throw new Error();
    }
    info.activationStreamContexts.terminateAll();
    this.functionDefinitionInfo.delete(functionId);
  }

  updateFunctionCompiledCode(functionId: string, compiledDefinition: CompiledDefinition) {
    // TODO: Diff new compiled definition vs old, calling activationStreamContext addContext and removeContext as necessary
  }
}

