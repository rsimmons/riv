import { ExecutionContext, useVar, useInitialize, useRequestUpdate } from 'riv-runtime';
import { CompiledDefinition, AppSpec, CallingConvention } from './CompiledDefinition';
import { StreamID, FunctionID, ApplicationID } from './Tree';
import Environment from './Environment';

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

      for (const {sid, val} of currentDefinition.constStreams) {
        streamEnv.set(sid, val);
      }

      for (const {fid, def} of currentDefinition.localDefs) {
        const [sf, updateDef] = createLiveFunction(def, streamEnv, funcEnv);
        funcEnv.set(fid, sf);
        updateLocalDef.set(fid, updateDef);
      }

      for (const {appId, funcId} of currentDefinition.apps) {
        const func = funcEnv.get(funcId);
        if (!func) {
          throw Error();
        }
        const context = new ExecutionContext(func, requestUpdate);
        applicationContexts.set(appId, context);
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

    for (const {sids, appId, funcId, sargIds, fargIds, callConv, settings} of currentDefinition.apps) {
      const appFunc = funcEnv.getExisting(funcId);
      const sargVals = sargIds.map(sid => streamEnv.getExisting(sid));
      const fargVals = fargIds.map(fid => funcEnv.getExisting(fid));

      let context = applicationContexts.get(appId);
      if (!context) {
        throw new Error();
      }

      context._setStreamFunc(appFunc);

      let retval: any;
      let error: boolean;
      try {
        switch (callConv) {
          case CallingConvention.Raw:
            retval = context.update(...sargVals, ...fargVals);
            break;

          case CallingConvention.SettingsStructured:
            retval = context.update(settings, sargVals, fargVals);
            break;

          default: {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const exhaustive: never = callConv; // this will cause a type error if we haven't handled all cases
            throw new Error();
          }
        }
        error = false;
      } catch (e) {
        console.log('application error', e);
        error = true;
      }

      switch (callConv) {
        case CallingConvention.Raw:
          if (sids.length === 1) {
            streamEnv.set(sids[0], error ? undefined : retval);
          } else if (sids.length > 1) {
            sids.forEach((sid, idx) => {
              streamEnv.set(sid, error ? undefined : retval[idx]);
            });
          }
          break;

        case CallingConvention.SettingsStructured:
          sids.forEach((sid, idx) => {
            streamEnv.set(sid, error ? undefined : retval[idx]);
          });
          break;

        default: {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const exhaustive: never = callConv; // this will cause a type error if we haven't handled all cases
          throw new Error();
        }
      }
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
    if (JSON.stringify(newDefinition) === JSON.stringify(currentDefinition)) {
      return;
    }

    // Track these so we know which streams to delete
    const oldDefStreams: Set<StreamID> = new Set();
    const newDefStreams: Set<StreamID> = new Set();

    // PARAM STREAMS
    for (const sid of currentDefinition.streamParamIds) {
      oldDefStreams.add(sid);
    }
    for (const sid of newDefinition.streamParamIds) {
      newDefStreams.add(sid);
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
        activation.streamEnv.set(sid, val);
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
          const func = activation.funcEnv.get(funcId);
          if (!func) {
            throw Error();
          }
          const context = new ExecutionContext(func, activation.requestUpdate);
          activation.applicationContexts.set(appId, context);
        });
      }
    }

    // DELETE STREAMS THAT NO LONGER EXIST
    for (const sid of oldDefStreams) {
      if (!newDefStreams.has(sid)) {
        activations.forEach(activation => {
          activation.streamEnv.delete(sid);
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
          activation.funcEnv.delete(fid);
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
          const [sf, updateDef] = createLiveFunction(def, activation.streamEnv, activation.funcEnv);
          activation.funcEnv.set(fid, sf);
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
