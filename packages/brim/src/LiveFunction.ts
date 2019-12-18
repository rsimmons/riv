import { ExecutionContext, useVar, useInitialize, useRequestUpdate } from 'riv-runtime';
import { CompiledDefinition } from './CompiledDefinition';
import { StreamID, FunctionID, ApplicationID } from './Tree';
import Environment from './Environment';

/*
export function createLiveFunction(initialDefinition: CompiledDefinition, outerFunctionEnvironment: Environment<FunctionID, Function>): [Function, (newDefinition: CompiledDefinition) => void] {
  return [() => { console.log('live function call') }, () => {}];
}
*/

/**
 * I think that functions in outer environment are not allowed to change identity.
 */
export function createLiveFunction(initialDefinition: CompiledDefinition, outerStreamEnv: Environment<StreamID, any>, outerFuncEnv: Environment<FunctionID, Function>): [Function, (newDefinition: CompiledDefinition) => void] {
  interface Activation {
    streamEnv: Environment<StreamID, any>; // local streams ids to their latest values
    funcEnv: Environment<FunctionID, Function>; // local function ids to their JS functions
    applicationContexts: Map<ApplicationID, ExecutionContext>;
    updateLocalDef: Map<FunctionID, (newDefinition: CompiledDefinition) => void>;
    requestUpdate: () => void;
  }

  const activations: Set<Activation> = new Set();
  let currentDefinition = initialDefinition;

  function streamFunc() { // NOTE: this can't be an arrow function because we use "arguments"
    /* eslint-disable react-hooks/rules-of-hooks */
    const requestUpdate = useRequestUpdate();

    const activation = useVar<Activation>((): Activation => {
      const streamEnv = new Environment(outerStreamEnv);
      const funcEnv = new Environment(outerFuncEnv);
      const applicationContexts: Map<ApplicationID, ExecutionContext> = new Map();
      const updateLocalDef: Map<FunctionID, (newDefinition: CompiledDefinition) => void> = new Map();

      for (const {fid, def} of currentDefinition.localDefs) {
        const [sf, updateDef] = createLiveFunction(def, streamEnv, funcEnv);
        funcEnv.set(fid, sf);
        updateLocalDef.set(fid, updateDef);
      }

      return {
        streamEnv,
        funcEnv,
        applicationContexts,
        updateLocalDef,
        requestUpdate,
      };
    });

    useInitialize(() => {
      activations.add(activation.current);
      return () => {
        activation.current.applicationContexts.forEach((ctx) => {
          ctx.terminate();
        });
        activations.delete(activation.current);
      };
    });

    const { streamEnv, funcEnv, applicationContexts } = activation.current;

    const expectedArgCount = currentDefinition.streamParamIds.length + currentDefinition.funcParamIds.length;
    if (arguments.length !== expectedArgCount) {
      throw new Error('wrong number of arguments to live function, got ' + arguments.length + ' expected ' + expectedArgCount);
    }

    const args = arguments;
    currentDefinition.streamParamIds.forEach((sid, idx) => {
      streamEnv.set(sid, args[idx]);
    });

    for (const {sid, val} of currentDefinition.constStreams) {
      streamEnv.set(sid, val);
    }

    const unusedAppCtxIds = new Set(applicationContexts.keys());

    for (const {sids, appId, funcId, sargIds, fargIds} of currentDefinition.apps) {
      const sargVals = sargIds.map(sid => streamEnv.get(sid));
      const fargVals = fargIds.map(fid => funcEnv.get(fid));

      let context = applicationContexts.get(appId);
      if (!context) {
        const func = funcEnv.get(funcId);
        if (!func) {
          throw Error();
        }
        context = new ExecutionContext(func, requestUpdate);
        applicationContexts.set(appId, context);
      }

      unusedAppCtxIds.delete(appId);

      let retval: any;
      try {
        retval = context.update(...sargVals, ...fargVals);
      } catch (e) {
        console.log('application error');
      }

      if (sids.length === 1) {
        streamEnv.set(sids[0], retval);
      } else if (sids.length > 1) {
        sids.forEach((sid, idx) => {
          streamEnv.set(sid, retval[idx]);
        });
      }
    }

    // "GC" unused application contexts
    for (const appId of unusedAppCtxIds) {
      const ctx = applicationContexts.get(appId);
      if (!ctx) {
        throw new Error();
      }
      ctx.terminate();

      applicationContexts.delete(appId);
    }

    if (currentDefinition.yieldIds.length === 1) {
      return streamEnv.get(currentDefinition.yieldIds[0]);
    } else if (currentDefinition.yieldIds.length > 1) {
      return currentDefinition.yieldIds.map(sid => streamEnv.get(sid));
    } else {
      return undefined;
    }
  };

  const updateDefinition = (newDefinition: CompiledDefinition): void => {
    console.log('update definition');
    if (JSON.stringify(newDefinition) === JSON.stringify(currentDefinition)) {
      return;
    }

    const oldLocalDefsMap: Map<string, CompiledDefinition> = new Map();
    for (const {fid, def} of currentDefinition.localDefs) {
      oldLocalDefsMap.set(fid, def);
    }
    for (const {fid, def} of newDefinition.localDefs) {
      if (oldLocalDefsMap.has(fid)) {
        activations.forEach(activation => {
          const update = activation.updateLocalDef.get(fid);
          if (!update) {
            throw new Error();
          }
          update(def);
        });
      } else {
        activations.forEach(activation => {
          const [sf, updateDef] = createLiveFunction(def, activation.streamEnv, activation.funcEnv);
          activation.funcEnv.set(fid, sf);
          activation.updateLocalDef.set(fid, updateDef);
        });
      }
    }

    currentDefinition = newDefinition;

    activations.forEach(activation => {
      activation.requestUpdate();
    });

    /*
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
          activation.applicationContexts.get(sid)!.terminate();
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
            activation.applicationContexts.get(sid)!.terminate();
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
          activation.applicationContexts.set(sid, new ExecutionContext(func, activation.requestUpdate));
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
          activation.updateLocalDef.delete(fid);
        });
      }
    }

    for (const {id: fid, definition: def} of newDefinition.containedFunctionDefinitions) {
      if (!oldDefMap.has(fid)) {
        activations.forEach(activation => {
          const [sf, updateDef] = createLiveFunction(def, activation.environment);
          activation.environment.set(fid, sf);
          activation.updateLocalDef.set(fid, updateDef);
        });
      } else {
        activations.forEach(activation => {
          activation.updateLocalDef.get(fid)!(def);
        });
      }
    }
    */
  };

  return [streamFunc, updateDefinition];
}
