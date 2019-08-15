import { ExecutionContext, useVar, useInitialize, useRequestUpdate } from 'riv-runtime';
import { CompiledDefinition } from './Compiler';
import { StreamID, FunctionID } from './State';

function arraysShallowEqual(a: Array<any>, b: Array<any>): boolean {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
}

// TODO: We could just make this an alias for {[key: string]: V}, use plain funcs instead of methods
export class Environment<V> {
  private obj: {[key: string]: V};

  constructor(outer: Environment<V> | undefined = undefined) {
    this.obj = Object.create(outer ? outer.obj : null);
  }

  get(name: string): V | undefined {
    return this.obj[name];
  }

  set(name: string, value: V) {
    this.obj[name] = value;
  }

  delete(name: string): void {
    delete this.obj[name];
  }
}

/**
 * Function environments may have names added or removed, but the value for a name must never change.
 */
export function createLiveFunction(initialDefinition: CompiledDefinition, outerStreamEnvironment: Environment<any>, outerFunctionEnvironment: Environment<Function>): [Function, (newDefinition: CompiledDefinition) => void] {
  interface Activation {
    streamEnvironment: Environment<any>;
    functionEnvironment: Environment<Function>;
    applicationContext: Map<string, ExecutionContext>;
    updateContainedDefinition: Map<FunctionID, (newDefinition: CompiledDefinition) => void>;
    requestUpdate: () => void;
  }

  const activations: Set<Activation> = new Set();
  let compiledDefinition = initialDefinition;

  const streamFunc = () => {
    /* eslint-disable react-hooks/rules-of-hooks */
    const requestUpdate = useRequestUpdate();

    const activation = useVar<Activation>(() => {
      const streamEnvironment = new Environment(outerStreamEnvironment);
      const functionEnvironment = new Environment(outerFunctionEnvironment);

      for (const [sid, value] of compiledDefinition.literalStreamValues) {
        streamEnvironment.set(sid, value);
      }

      const applicationContext: Map<StreamID, ExecutionContext> = new Map();
      for (const [sid, fid, ] of compiledDefinition.applications) {
        const func = functionEnvironment.get(fid);
        if (!func) {
          throw Error();
        }
        applicationContext.set(sid, new ExecutionContext(func, requestUpdate));
      }

      const updateContainedDefinition: Map<FunctionID, (newDefinition: CompiledDefinition) => void> = new Map();
      for (const [fid, def] of compiledDefinition.containedDefinitions) {
        const [sf, updateDef] = createLiveFunction(def, streamEnvironment, functionEnvironment);
        functionEnvironment.set(fid, sf);
        updateContainedDefinition.set(fid, updateDef);
      }

      return {
        streamEnvironment,
        functionEnvironment,
        applicationContext,
        updateContainedDefinition,
        requestUpdate,
      };
    });

    useInitialize(() => {
      activations.add(activation.current);
      return () => {
        activation.current.applicationContext.forEach((ctx) => {
          ctx.terminate();
        });
        activations.delete(activation.current);
      };
    });

    const {streamEnvironment: streamEnv, applicationContext: appCtx} = activation.current;
    for (const [sid, , argIds] of compiledDefinition.applications) {
      const argVals = argIds.map(id => streamEnv.get(id));
      const context = appCtx.get(sid);
      if (!context) { throw new Error(); }
      streamEnv.set(sid, context.update(...argVals));
    }

    if (compiledDefinition.yieldStream) {
      return streamEnv.get(compiledDefinition.yieldStream);
    } else {
      return undefined;
    }
  };

  const updateCompiledDefinition = (newDefinition: CompiledDefinition): void => {
    //
    // RECONCILE LITERALS
    //
    const oldLiteralMap: Map<string, any> = new Map();
    const newLiteralMap: Map<string, any> = new Map();

    for (const [sid, val] of compiledDefinition.literalStreamValues) {
      oldLiteralMap.set(sid, val);
    }
    for (const [sid, val] of newDefinition.literalStreamValues) {
      newLiteralMap.set(sid, val);
    }

    for (const [sid, ] of compiledDefinition.literalStreamValues) {
      if (!newLiteralMap.has(sid)) {
        activations.forEach(activation => {
          activation.streamEnvironment.delete(sid);
        });
      }
    }

    for (const [sid, val] of newDefinition.literalStreamValues) {
      if (!oldLiteralMap.has(sid) || (oldLiteralMap.get(sid) !== val)) {
        activations.forEach(activation => {
          activation.streamEnvironment.set(sid, val);
        });
      }
    }

    //
    // RECONCILE APPLICATIONS
    //
    const oldAppMap: Map<string, [FunctionID, Array<string>]> = new Map();
    const newAppMap: Map<string, [FunctionID, Array<string>]> = new Map();

    for (const [sid, func, args] of compiledDefinition.applications) {
      oldAppMap.set(sid, [func, args]);
    }
    for (const [sid, func, args] of newDefinition.applications) {
      newAppMap.set(sid, [func, args]);
    }

    for (const [sid, , ] of compiledDefinition.applications) {
      if (!newAppMap.has(sid)) {
        activations.forEach(activation => {
          activation.applicationContext.get(sid)!.terminate();
        });
      }
    }

    for (const [sid, funcId, args] of newDefinition.applications) {
      let createNew = false;

      const oldApp = oldAppMap.get(sid);
      if (oldApp) {
        const [oldFuncId, oldArgs] = oldApp;

        if ((funcId !== oldFuncId) || !arraysShallowEqual(args, oldArgs)) {
          activations.forEach(activation => {
            activation.applicationContext.get(sid)!.terminate();
          });

          createNew = true;
        }
      } else {
        createNew = true;
      }

      if (createNew) {
        activations.forEach(activation => {
          const func = activation.functionEnvironment.get(funcId);
          if (!func) {
            throw Error();
          }
          activation.applicationContext.set(sid, new ExecutionContext(func, activation.requestUpdate));
        });
      }
    }

    //
    // FINISH UP
    //
    compiledDefinition = newDefinition;

    activations.forEach(activation => {
      activation.requestUpdate();
    });
  };

  return [streamFunc, updateCompiledDefinition];
}
