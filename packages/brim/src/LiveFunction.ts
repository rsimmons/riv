import { ExecutionContext, useVar, useInitialize, useRequestUpdate } from 'riv-runtime';
import { CompiledDefinition } from './Compiler';

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

export function createLiveFunction(initialDefinition: CompiledDefinition): [Function, (newDefinition: CompiledDefinition) => void] {
  interface Activation {
    applicationContext: Map<string, ExecutionContext>;
    requestUpdate: () => void;
  }

  const activations: Set<Activation> = new Set();
  let compiledDefinition = initialDefinition;

  const streamFunc = () => {
    /* eslint-disable react-hooks/rules-of-hooks */
    const requestUpdate = useRequestUpdate();

    const activation = useVar<Activation>(() => {
      const applicationContext: Map<string, ExecutionContext> = new Map();

      for (const [sid, func, ] of compiledDefinition.applications) {
        applicationContext.set(sid, new ExecutionContext(func, requestUpdate));
      }

      return {
        applicationContext,
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

    const streamValues = new Map(compiledDefinition.literalStreamValues); // clone
    const appCtx = activation.current.applicationContext;
    for (const [sid, , argIds] of compiledDefinition.applications) {
      const argVals = argIds.map(id => streamValues.get(id));
      const context = appCtx.get(sid);
      if (!context) { throw new Error(); }
      streamValues.set(sid, context.update(...argVals));
    }
  };

  const updateCompiledDefinition = (newDefinition: CompiledDefinition): void => {
    const oldAppMap: Map<string, [Function, Array<string>]> = new Map();
    const newAppMap: Map<string, [Function, Array<string>]> = new Map();

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
    };

    for (const [sid, func, args] of newDefinition.applications) {
      let createNew = false;

      const oldApp = oldAppMap.get(sid);
      if (oldApp) {
        const [oldFunc, oldArgs] = oldApp;

        if ((func !== oldFunc) || !arraysShallowEqual(args, oldArgs)) {
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
          activation.applicationContext.set(sid, new ExecutionContext(func, activation.requestUpdate));
        });
      }
    }

    compiledDefinition = newDefinition;

    activations.forEach(activation => {
      activation.requestUpdate();
    });
  };

  return [streamFunc, updateCompiledDefinition];
}
