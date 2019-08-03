import { ExecutionContext, useVar, useInitialize, useRequestUpdate } from 'riv-runtime';
import { CompiledDefinition } from './Compiler';

export function createLiveFunction(initialDefinition: CompiledDefinition): [Function, (newDefinition: CompiledDefinition) => void] {
  interface Activation {
    applicationContext: Map<string, ExecutionContext>;
  }

  const activations: Set<Activation> = new Set();
  let compiledDefinition = initialDefinition;

  const streamFunc = () => {
    const requestUpdate = useRequestUpdate();

    const activation = useVar<Activation>(() => {
      const applicationContext: Map<string, ExecutionContext> = new Map();

      for (const [sid, func, argIds] of compiledDefinition.applications) {
        applicationContext.set(sid, new ExecutionContext(func, requestUpdate));
      }

      return {
        applicationContext,
      };
    });

    useInitialize(() => {
      activations.add(activation.current);
      return () => {
        activations.delete(activation.current);
      };
    });

    const streamValues = new Map(compiledDefinition.literalStreamValues); // clone
    const appCtx = activation.current.applicationContext;
    for (const [sid, func, argIds] of compiledDefinition.applications) {
      const argVals = argIds.map(id => streamValues.get(id));
      const context = appCtx.get(sid);
      if (!context) { throw new Error(); }
      streamValues.set(sid, context.update(...argVals));
    }
  };

  const updateCompiledDefinition = (newDefinition: CompiledDefinition): void => {
    // TODO: set compiledDefinition = newDefinition after we do some updates
    throw new Error('unimplemented');
  };

  return [streamFunc, updateCompiledDefinition];
}
