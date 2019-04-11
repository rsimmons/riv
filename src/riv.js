let currentUpdateFrame = null;

class ExecutionContext {
  constructor(streamFunc, onRequestUpdate, afterTerminate) {
    this.streamFunc = streamFunc;
    this.onRequestUpdate = onRequestUpdate;
    this.afterTerminate = afterTerminate;

    this.hookRecordChain = {next: null}; // dummy
    this.recordCursor = null; // only set when this context is updating
    this.openRecord = null;
    this.updateCount = 0;
  }

  update() {
    // Push a new update frame onto the update stack for this context
    const newFrame = {
      executionContext: this,
      previousFrame: currentUpdateFrame,
    };
    currentUpdateFrame = newFrame;

    // Move hook record cursor to start of chain
    this.recordCursor = this.hookRecordChain;

    const retval = this.streamFunc.apply(null, arguments);

    // This should be null, otherwise there are hook records we didn't get to, and something is amiss
    if (this.recordCursor.next) {
      throw new Error('Did not reach all hook records in update');
    }

    // Pop the top frame from the update stack
    const poppedFrame = currentUpdateFrame;
    if (!poppedFrame) {
      throw new Error('Cannot pop update frame because current is null');
    }
    if (poppedFrame.executionContext !== this) {
      throw new Error("Popped frame from update stack but context did not match");
    }
    currentUpdateFrame = poppedFrame.previousFrame;

    this.updateCount++;

    return retval;
  }

  terminate() {
    // NOTE: Might we want to sanity check that this context isn't anywhere in the current update stack?

    // Call any cleanup functions set by hooks
    // TODO: Do we need to worry about order?
    for (let c = this.hookRecordChain.next; c; c = c.next) {
      if (c.cleanup) {
        c.cleanup();
      }
    }

    if (this.afterTerminate) {
      this.afterTerminate();
    }
  }

  _beginHook() {
    if (this.openRecord) {
      throw new Error('This is already an open hook when beginning another');
    }

    if (this.updateCount === 0) {
      if (this.recordCursor.next) {
        throw new Error('Expecting to create new hook record in chain, but already present');
      }
      // Create new record
      this.recordCursor.next = {
        data: undefined,
        cleanup: undefined,
        next: null,
      }
    }

    if (!this.recordCursor.next) {
      throw new Error('Expecting to find hook record in chain, but not present');
    }

    this.openRecord = this.recordCursor.next;

    return this.recordCursor.next;
  }

  _endHook() {
    if (this.openRecord !== this.recordCursor.next) {
      throw new Error('Hook close does not match open');
    }
    this.openRecord = null;

    this.recordCursor = this.recordCursor.next; // move cursor forward
  }

  _requestUpdate() {
    this.onRequestUpdate();
  }

  /**
   * This is only safe to do if the replacement function calls the same hooks, has same signature, etc.
   * It's currently used to provide a function that is lexically the same but bound to different outer-scope
   * variables.
   */
  _setStreamFunc(newStreamFunc) {
    this.streamFunc = newStreamFunc;
  }
}

export function createNoInOutExecutionContext(streamFunc) {
  const onRequestUpdate = () => { ctx.update() };
  const ctx = new ExecutionContext(streamFunc, onRequestUpdate)
  return ctx;
}

/**
 * This is used by hooks to get the currently updating context (after verifying it is set)
 */
function getTopUpdatingExecutionContext() {
  if (!currentUpdateFrame) {
    throw new Error('Cannot get currently updating execution context because update stack is empty. Was a hook called outside of an execution context update?');
  }
  return currentUpdateFrame.executionContext;
}

export function useVar(initVal) {
  const ctx = getTopUpdatingExecutionContext();
  const record = ctx._beginHook();

  // Create value box if necessary
  if (!record.data) {
    record.data = {current: initVal};
  }

  ctx._endHook();

  return record.data;
}

/**
 * Why do we need a hook? Why can't we just call ctx.requestUpdate()? Because the requestUpdate
 * function that we return will often be called without there being any updating execution context
 * (e.g. from an event handler). So it has to be bound to the correct context.
 */
export function useRequestUpdate() {
  const ctx = getTopUpdatingExecutionContext();
  const record = ctx._beginHook();

  // Create callback if necessary. We store it so that we already return the same one.
  if (!record.data) {
    record.data = {requestUpdate: () => {
      ctx._requestUpdate(); // it's important that we use ctx from closure, not getTopUpdatingExecutionContext() here
    }};
  }

  ctx._endHook();

  return record.data.requestUpdate;
}

export function useInitialize(initializer) {
  const ctx = getTopUpdatingExecutionContext();
  const record = ctx._beginHook();

  // Initialize if necessary
  if (!record.data) {
    // data being undefined means this is the first call

    record.cleanup = initializer();

    record.data = {}; // no data to store yet, just needs to be truthy to indicate that initialization ran
  }

  ctx._endHook();
}

export function useEventEmitter() {
  const ctx = getTopUpdatingExecutionContext();
  const record = ctx._beginHook();

  // Initialize record data if necessary
  if (!record.data) {
    const subscribers = new Set();

    const stream = {
      subscribe: (onEvent) => {
        subscribers.add(onEvent);
        return () => { // unsubscribe
          subscribers.delete(onEvent);
        };
      }
    }

    const emit = (value) => {
      for (const sub of subscribers) {
        sub(value);
      }
    };

    record.data = {
      stream,
      emit,
    }
  }

  ctx._endHook();

  return [record.data.stream, record.data.emit];
}

export function useEventReceiver(stream) {
  const ctx = getTopUpdatingExecutionContext();
  const record = ctx._beginHook();

  // Initialize record data if necessary
  if (!record.data) {
    const queue = [];

    const data = {
      queue,
      lastStream: undefined,
      unsubscribe: undefined,
      onValue: (value) => {
        queue.push(value);
      },
    };

    record.data = data;

    record.cleanup = () => {
      if (data.unsubscribe) {
        data.unsubscribe();
      }
    };
  }

  let retval;
  if (stream !== record.data.lastStream) {
    // Stream changed identity

    // I _think_ we want to disallow this, since semantics are unclear
    if (record.data.queue.length) {
      throw new Error('useEventReceiver stream changed, but value is in queue');
    }

    if (record.data.lastStream) {
      record.data.unsubscribe();
      record.data.lastStream = undefined;
      record.data.unsubscribe = undefined;
    }

    // TODO: We could validate that it's either undefined or null or a valid stream object
    record.data.lastStream = stream;
    if (stream) {
      record.data.unsubscribe = stream.subscribe(record.data.onValue);
    }
  } else {
    // Stream did not change identity. Check if there is an value in the queue
    if (record.data.queue.length) {
      if (record.data.queue.length > 1) {
        throw new Error('useEventReceiver found more than one enqueued value');
      }

      const eventValue = record.data.queue.pop();
      retval = {value: eventValue};
    }
  }

  ctx._endHook();

  return retval;
}

/**
 * The streamFunc argument may change, but it should only change to a function that can be safely
 * swapped in (i.e. one that calls the same hooks, etc.). A common case is that streamFunc is a
 * closure that references some outer scope variables, and when those change, a new "version" of
 * the function is created (lexically the same, but closing over a different scope).
 *
 * onRequestUpdate is currently only read on the first call, so changes to it will have no effect.
 */
export function useDynamic(streamFunc, onRequestUpdate) {
  const ctx = getTopUpdatingExecutionContext();
  const record = ctx._beginHook();

  // Initialize record data if necessary
  if (!record.data) {
    const data = {};

    // If no onRequestUpdate is provided, default to requesting update on the current context
    const oru = onRequestUpdate || (() => {
      ctx._requestUpdate();
    });

    // Track ExecutionContexts created (and not yet terminated) so we can terminate them upon cleanup
    data.activeContexts = new Set();

    // Create "factory" function to instantiate new contexts
    data.createContext = () => {
      const ctx = new ExecutionContext(data.streamFunc, oru, () => { data.activeContexts.delete(ctx); });
      data.activeContexts.add(ctx);
      return ctx;
    };

    record.data = data;
    record.cleanup = () => {
      for (const ctx of data.activeContexts) {
        ctx.terminate();
      }
    };
  }

  // Update the stream function in record and all active contexts.
  record.data.streamFunc = streamFunc;
  for (const ctx of record.data.activeContexts) {
    ctx._setStreamFunc(streamFunc);
  }

  ctx._endHook();

  return record.data.createContext;
}

/**
 * NOTE: reducerFunc should be pure-pointwise, NOT a stream func
 */
export function useReducer(actionEvts, reducerFunc, initialState) {
  const state = useVar(initialState);
  const action = useEventReceiver(actionEvts);
  if (action) {
    state.current = reducerFunc(action.value, state.current);
  }
  return state.current;
}

/**
 * TODO: Could/should this take an optional onRequestUpdate parameter?
 */
export function useMachine(states, initialTransition) {
  const ctx = getTopUpdatingExecutionContext();
  const record = ctx._beginHook();

  const takeTransition = (trans) => {
    // If there's an old context, terminate it
    if (record.data.activeContext) {
      record.data.activeContext.terminate();
    }

    const [newState, newStateArg] = trans;

    // Create a new context and store it in record (but don't update it)
    const newCtx = new ExecutionContext(states[newState], () => { ctx._requestUpdate(); });

    record.data.activeState = newState;
    record.data.activeContext = newCtx;
    record.data.activeArgument = newStateArg;
  };

  if (!record.data) {
    const data = {};
    record.data = data;

    takeTransition(initialTransition); // this will set stuff in record.data

    record.cleanup = () => {
      data.activeContext.terminate();
    };
  }

  let retval;
  while (true) {
    // Set the state function in the active context (in case it changed)
    record.data.activeContext._setStreamFunc(states[record.data.activeState]);

    // Update the active context
    const [tmpRetval, transition] = record.data.activeContext.update(record.data.activeArgument);
    retval = tmpRetval;

    // Did the state function return a transition to take?
    if (transition) {
      takeTransition(transition);
      // And loop again
    } else {
      // There was no transition
      break;
    }
  }

  ctx._endHook();

  return retval;
}
