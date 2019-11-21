import { ExecutionContext, useVar, useInitialize, useRequestUpdate } from 'riv-runtime';
import { CompiledDefinition } from './CompiledDefinition';
import { StreamID, FunctionID } from './Tree';
import Environment from './Environment';

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

/**
 * I think that functions in outer environment are not allowed to change identity.
 */
/*
export function createLiveFunction(initialDefinition: CompiledDefinition, outerEnvironment: Environment<any>): [Function, (newDefinition: CompiledDefinition) => void] {
  interface Activation {
    environment: Environment<any>;
    applicationContext: Map<string, ExecutionContext>;
    updateContainedDefinition: Map<FunctionID, (newDefinition: CompiledDefinition) => void>;
    requestUpdate: () => void;
  }

  const activations: Set<Activation> = new Set();
  let currentDefinition = initialDefinition;

  function streamFunc() { // NOTE: this can't be an arrow function because we use "arguments"
    // eslint-disable react-hooks/rules-of-hooks
    const requestUpdate = useRequestUpdate();

    const activation = useVar<Activation>(() => {
      const environment = new Environment(outerEnvironment);

      for (const {streamId, value} of currentDefinition.constantStreamValues) {
        environment.set(streamId, value);
      }

      const applicationContext: Map<StreamID, ExecutionContext> = new Map();
      for (const {resultStreamId: sid, appliedFunction: fid} of currentDefinition.applications) {
        const func = environment.get(fid);
        if (!func) {
          console.log(fid);
          throw Error();
        }
        applicationContext.set(sid, new ExecutionContext(func, requestUpdate));
      }

      const updateContainedDefinition: Map<FunctionID, (newDefinition: CompiledDefinition) => void> = new Map();
      for (const {id: fid, definition: def} of currentDefinition.containedFunctionDefinitions) {
        const [sf, updateDef] = createLiveFunction(def, environment);
        environment.set(fid, sf);
        updateContainedDefinition.set(fid, updateDef);
      }

      return {
        environment,
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

    const {environment, applicationContext: appCtx} = activation.current;

    if (arguments.length !== currentDefinition.parameters.length) {
      throw new Error('wrong number of arguments to live function, got ' + arguments.length + ' expected ' + currentDefinition.parameters.length);
    }
    let idx = 0;
    for (const {id: sid} of currentDefinition.parameters) {
      environment.set(sid, arguments[idx]);
      idx++;
    }

    for (const {resultStreamId: sid, argumentIds: argIds} of currentDefinition.applications) {
      const argVals = argIds.map(id => environment.get(id));

      const context = appCtx.get(sid);
      if (!context) { throw new Error(); }
      let appVal;
      try {
        appVal = context.update(...argVals);
      } catch (e) {
        console.log('application error');
      }
      environment.set(sid, appVal);
    }

    if (currentDefinition.yieldStreamId) {
      return environment.get(currentDefinition.yieldStreamId);
    } else {
      return undefined;
    }
  };

  const updateDefinition = (newDefinition: CompiledDefinition): void => {
    if (JSON.stringify(newDefinition) === JSON.stringify(currentDefinition)) {
      return;
    }

    //
    // RECONCILE LITERALS
    //
    const oldLiteralMap: Map<string, any> = new Map();
    const newLiteralMap: Map<string, any> = new Map();

    for (const {streamId: sid, value: val} of currentDefinition.constantStreamValues) {
      oldLiteralMap.set(sid, val);
    }
    for (const {streamId: sid, value: val} of newDefinition.constantStreamValues) {
      newLiteralMap.set(sid, val);
    }

    for (const {streamId: sid} of currentDefinition.constantStreamValues) {
      if (!newLiteralMap.has(sid)) {
        activations.forEach(activation => {
          activation.environment.delete(sid);
        });
      }
    }

    for (const {streamId: sid, value: val} of newDefinition.constantStreamValues) {
      if (!oldLiteralMap.has(sid) || (oldLiteralMap.get(sid) !== val)) {
        activations.forEach(activation => {
          activation.environment.set(sid, val);
        });
      }
    }

    //
    // RECONCILE APPLICATIONS
    //
    const oldAppMap: Map<string, [FunctionID, Array<AnyID>]> = new Map();
    const newAppMap: Map<string, [FunctionID, Array<AnyID>]> = new Map();

    for (const {resultStreamId: sid, appliedFunction: func, argumentIds: args} of currentDefinition.applications) {
      oldAppMap.set(sid, [func, args]);
    }
    for (const {resultStreamId: sid, appliedFunction: func, argumentIds: args} of newDefinition.applications) {
      newAppMap.set(sid, [func, args]);
    }

    for (const {resultStreamId: sid} of currentDefinition.applications) {
      if (!newAppMap.has(sid)) {
        activations.forEach(activation => {
          activation.applicationContext.get(sid)!.terminate();
        });
      }
    }

    for (const {resultStreamId: sid, appliedFunction: funcId, argumentIds: args} of newDefinition.applications) {
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
          const func = activation.environment.get(funcId);
          if (!func) {
            throw Error();
          }
          activation.applicationContext.set(sid, new ExecutionContext(func, activation.requestUpdate));
        });
      }
    }

    //
    // RECONCILE CONTAINED DEFINITIONS
    //
    const oldDefMap: Map<FunctionID, CompiledDefinition> = new Map();
    const newDefMap: Map<FunctionID, CompiledDefinition> = new Map();

    for (const {id: fid, definition: def} of currentDefinition.containedFunctionDefinitions) {
      oldDefMap.set(fid, def);
    }
    for (const {id: fid, definition: def} of newDefinition.containedFunctionDefinitions) {
      newDefMap.set(fid, def);
    }

    for (const {id: fid} of currentDefinition.containedFunctionDefinitions) {
      if (!newDefMap.has(fid)) {
        activations.forEach(activation => {
          activation.environment.delete(fid);
          activation.updateContainedDefinition.delete(fid);
        });
      }
    }

    for (const {id: fid, definition: def} of newDefinition.containedFunctionDefinitions) {
      if (!oldDefMap.has(fid)) {
        activations.forEach(activation => {
          const [sf, updateDef] = createLiveFunction(def, activation.environment);
          activation.environment.set(fid, sf);
          activation.updateContainedDefinition.set(fid, updateDef);
        });
      } else {
        activations.forEach(activation => {
          activation.updateContainedDefinition.get(fid)!(def);
        });
      }
    }

    //
    // FINISH UP
    //
    currentDefinition = newDefinition;

    activations.forEach(activation => {
      activation.requestUpdate();
    });
  };

  return [streamFunc, updateDefinition];
}
*/
