import { ExecutionContext, useVar, useInitialize, useRequestUpdate } from 'riv-runtime';
import { CompiledDefinition, AppSpec } from './CompiledDefinition';
import { StreamID, FunctionID, ApplicationID, ParameterID } from './Tree';
import Environment from './Environment';

/**
 * I think that functions in outer environment are not allowed to change identity.
 */
export function createLiveFunction(initialDefinition: CompiledDefinition, outerEnv: Environment<ParameterID, any>): [Function, (newDefinition: CompiledDefinition) => void] {
  interface Activation {
    combinedEnv: Environment<StreamID|FunctionID, any>; // local streams/function ids to their latest values (for functions, JS functions)
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
      const combinedEnv = new Environment(outerEnv);
      const applicationContexts: Map<ApplicationID, ExecutionContext> = new Map();
      const updateLocalDef: Map<FunctionID, (newDefinition: CompiledDefinition) => void> = new Map();

      for (const {sid, val} of currentDefinition.constStreams) {
        combinedEnv.set(sid, val);
      }

      for (const {fid, def} of currentDefinition.localDefs) {
        const [sf, updateDef] = createLiveFunction(def, combinedEnv);
        combinedEnv.set(fid, sf);
        updateLocalDef.set(fid, updateDef);
      }

      for (const {appId, funcId} of currentDefinition.apps) {
        const func = combinedEnv.getExisting(funcId);
        const context = new ExecutionContext(func, requestUpdate);
        applicationContexts.set(appId, context);
      }

      return {
        combinedEnv,
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

    const { combinedEnv, applicationContexts } = activation.current;

    const expectedArgCount = currentDefinition.paramIds.length;
    if (arguments.length !== expectedArgCount) {
      throw new Error('wrong number of arguments to live function, got ' + arguments.length + ' expected ' + expectedArgCount);
    }

    const args = arguments;
    currentDefinition.paramIds.forEach((pid, idx) => {
      combinedEnv.set(pid, args[idx]);
    });

    for (const {sids, appId, funcId, args, settings} of currentDefinition.apps) {
      const appFunc = combinedEnv.getExisting(funcId);
      const argVals = args.map(id => {
        if (typeof id !== 'string') {
          throw new Error(); // don't support array-params yet
        }
        return combinedEnv.getExisting(id);
      });

      let context = applicationContexts.get(appId);
      if (!context) {
        throw new Error();
      }

      context._setStreamFunc(appFunc);

      let retval: any;
      let error: boolean;
      try {
        retval = context.update(...argVals);
        error = false;
      } catch (e) {
        console.log('application error', e);
        error = true;
      }

      if (sids.length === 1) {
        combinedEnv.set(sids[0], error ? undefined : retval);
      } else if (sids.length > 1) {
        sids.forEach((sid, idx) => {
          combinedEnv.set(sid, error ? undefined : retval[idx]);
        });
      }
    }

    if (currentDefinition.returnStreamIds.length === 1) {
      return combinedEnv.get(currentDefinition.returnStreamIds[0]);
    } else if (currentDefinition.returnStreamIds.length > 1) {
      return currentDefinition.returnStreamIds.map(sid => combinedEnv.get(sid));
    } else {
      return undefined;
    }
  };

  const updateDefinition = (newDefinition: CompiledDefinition): void => {
    if (newDefinition === currentDefinition) {
      return;
    }

    // Track these so we know which streams to delete
    const oldDefStreams: Set<StreamID|FunctionID> = new Set();
    const newDefStreams: Set<StreamID|FunctionID> = new Set();

    // PARAM STREAMS
    for (const pid of currentDefinition.paramIds) {
      oldDefStreams.add(pid);
    }
    for (const pid of newDefinition.paramIds) {
      newDefStreams.add(pid);
    }

    //
    // CONST STREAMS
    //
    for (const {sid} of currentDefinition.constStreams) {
      oldDefStreams.add(sid);
    }

    for (const {sid, val} of newDefinition.constStreams) {
      // It's easier to just always set regardless of change
      activations.forEach(activation => {
        activation.combinedEnv.set(sid, val);
      });

      newDefStreams.add(sid);
    }

    //
    // APPLICATIONS
    //
    const oldAppMap: Map<ApplicationID, AppSpec> = new Map();
    const newAppMap: Map<ApplicationID, AppSpec> = new Map();
    for (const app of currentDefinition.apps) {
      oldAppMap.set(app.appId, app);

      app.sids.forEach(sid => {
        oldDefStreams.add(sid);
      });
    }
    for (const app of newDefinition.apps) {
      newAppMap.set(app.appId, app);

      app.sids.forEach(sid => {
        newDefStreams.add(sid);
      });
    }

    for (const {appId} of currentDefinition.apps) {
      if (!newAppMap.has(appId)) {
        activations.forEach(activation => {
          const context = activation.applicationContexts.get(appId);
          if (!context) {
            throw new Error();
          }
          context.terminate();
          activation.applicationContexts.delete(appId);
        });
      }
    }

    for (const {appId, funcId} of newDefinition.apps) {
      if (!oldAppMap.has(appId)) {
        activations.forEach(activation => {
          const func = activation.combinedEnv.getExisting(funcId);
          const context = new ExecutionContext(func, activation.requestUpdate);
          activation.applicationContexts.set(appId, context);
        });
      }
    }

    // DELETE STREAMS THAT NO LONGER EXIST
    for (const sid of oldDefStreams) {
      if (!newDefStreams.has(sid)) {
        activations.forEach(activation => {
          activation.combinedEnv.delete(sid);
        });
      }
    }

    //
    // LOCAL FUNCTION DEFINITIONS
    //
    const oldLocalDefsMap: Map<string, CompiledDefinition> = new Map();
    const newLocalDefsMap: Map<string, CompiledDefinition> = new Map();
    for (const {fid, def} of currentDefinition.localDefs) {
      oldLocalDefsMap.set(fid, def);
    }
    for (const {fid, def} of newDefinition.localDefs) {
      newLocalDefsMap.set(fid, def);
    }

    for (const {fid} of currentDefinition.localDefs) {
      if (!newLocalDefsMap.has(fid)) {
        activations.forEach(activation => {
          activation.combinedEnv.delete(fid);
          activation.updateLocalDef.delete(fid);
        });
      }
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
          const [sf, updateDef] = createLiveFunction(def, activation.combinedEnv);
          activation.combinedEnv.set(fid, sf);
          activation.updateLocalDef.set(fid, updateDef);
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
