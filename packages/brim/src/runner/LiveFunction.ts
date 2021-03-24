import { ExecutionContext, useVar, useInitialize, useRequestUpdate } from 'riv-runtime';
import { CompiledDefinition, AppSpec } from '../compiler/CompiledDefinition';
import { UID } from '../compiler/Tree';
import Environment from '../util/Environment';

/**
 * I think that functions in outer environment are not allowed to change identity.
 */
export function createLiveFunction(initialDefinition: CompiledDefinition, outerEnv: Environment<UID, any>): [Function, (newDefinition: CompiledDefinition) => void] {
  interface Activation {
    combinedEnv: Environment<UID, any>; // local streams/function ids to their latest values (for functions, JS functions)
    applicationContexts: Map<UID, ExecutionContext>;
    updateLocalDef: Map<UID, (newDefinition: CompiledDefinition) => void>;
    requestUpdate: () => void;
  }

  const activations: Set<Activation> = new Set();
  let currentDefinition = initialDefinition;

  function streamFunc() { // NOTE: this can't be an arrow function because we use "arguments"
    /* eslint-disable react-hooks/rules-of-hooks */
    const requestUpdate = useRequestUpdate();

    const activation = useVar<Activation>((): Activation => {
      const combinedEnv = new Environment(outerEnv);
      const applicationContexts: Map<UID, ExecutionContext> = new Map();
      const updateLocalDef: Map<UID, (newDefinition: CompiledDefinition) => void> = new Map();

      for (const {sid, val} of currentDefinition.consts) {
        combinedEnv.set(sid, val);
      }

      for (const def of currentDefinition.defs) {
        const [sf, updateDef] = createLiveFunction(def, combinedEnv);
        combinedEnv.set(def.fid, sf);
        updateLocalDef.set(def.fid, updateDef);
      }

      for (const {aid, fid} of currentDefinition.apps) {
        const func = combinedEnv.getExisting(fid);
        const context = new ExecutionContext(func, requestUpdate);
        applicationContexts.set(aid, context);
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

    const expectedArgCount = currentDefinition.pids.length;
    if (arguments.length !== expectedArgCount) {
      throw new Error('wrong number of arguments to live function, got ' + arguments.length + ' expected ' + expectedArgCount);
    }

    const args = arguments;
    currentDefinition.pids.forEach((pid, idx) => {
      combinedEnv.set(pid, args[idx]);
    });

    for (const {oid, aid, fid, args} of currentDefinition.apps) {
      const appFunc = combinedEnv.getExisting(fid);
      const argVals = args.map(id => {
        if (typeof id !== 'string') {
          throw new Error(); // don't support array-params yet
        }
        return combinedEnv.getExisting(id);
      });

      let context = applicationContexts.get(aid);
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

      if (oid) {
        combinedEnv.set(oid, error ? undefined : retval);
      }
    }

    if (currentDefinition.oid) {
      return combinedEnv.get(currentDefinition.oid);
    } else {
      return undefined;
    }
  };

  const updateDefinition = (newDefinition: CompiledDefinition): void => {
    if (newDefinition === currentDefinition) {
      return;
    }

    // Track these so we know which streams to delete
    const oldDefStreams: Set<UID> = new Set();
    const newDefStreams: Set<UID> = new Set();

    // PARAM STREAMS
    for (const pid of currentDefinition.pids) {
      oldDefStreams.add(pid);
    }
    for (const pid of newDefinition.pids) {
      newDefStreams.add(pid);
    }

    //
    // CONST STREAMS
    //
    for (const {sid} of currentDefinition.consts) {
      oldDefStreams.add(sid);
    }

    for (const {sid, val} of newDefinition.consts) {
      // It's easier to just always set regardless of change
      activations.forEach(activation => {
        activation.combinedEnv.set(sid, val);
      });

      newDefStreams.add(sid);
    }

    //
    // APPLICATIONS
    //
    const oldAppMap: Map<UID, AppSpec> = new Map();
    const newAppMap: Map<UID, AppSpec> = new Map();
    for (const app of currentDefinition.apps) {
      oldAppMap.set(app.aid, app);

      if (app.oid) {
        oldDefStreams.add(app.oid);
      }
    }
    for (const app of newDefinition.apps) {
      newAppMap.set(app.aid, app);

      if (app.oid) {
        newDefStreams.add(app.oid);
      }
    }

    for (const {aid} of currentDefinition.apps) {
      if (!newAppMap.has(aid)) {
        activations.forEach(activation => {
          const context = activation.applicationContexts.get(aid);
          if (!context) {
            throw new Error();
          }
          context.terminate();
          activation.applicationContexts.delete(aid);
        });
      }
    }

    for (const {aid, fid} of newDefinition.apps) {
      if (!oldAppMap.has(aid)) {
        activations.forEach(activation => {
          const func = activation.combinedEnv.getExisting(fid);
          const context = new ExecutionContext(func, activation.requestUpdate);
          activation.applicationContexts.set(aid, context);
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
    for (const def of currentDefinition.defs) {
      oldLocalDefsMap.set(def.fid, def);
    }
    for (const def of newDefinition.defs) {
      newLocalDefsMap.set(def.fid, def);
    }

    for (const {fid} of currentDefinition.defs) {
      if (!newLocalDefsMap.has(fid)) {
        activations.forEach(activation => {
          activation.combinedEnv.delete(fid);
          activation.updateLocalDef.delete(fid);
        });
      }
    }

    for (const def of newDefinition.defs) {
      if (oldLocalDefsMap.has(def.fid)) {
        activations.forEach(activation => {
          const update = activation.updateLocalDef.get(def.fid);
          if (!update) {
            throw new Error();
          }
          update(def);
        });
      } else {
        activations.forEach(activation => {
          const [sf, updateDef] = createLiveFunction(def, activation.combinedEnv);
          activation.combinedEnv.set(def.fid, sf);
          activation.updateLocalDef.set(def.fid, updateDef);
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
