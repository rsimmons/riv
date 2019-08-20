interface UpdateFrame {
  executionContext: ExecutionContext;
  previousFrame: UpdateFrame | null;
}

interface HookRecord {
  data: any;
  cleanup: (() => void) | null;
  next: HookRecord | null;
}

let currentUpdateFrame: UpdateFrame | null = null;

export class ExecutionContext {
  private hookRecordChain: HookRecord;
  private updateCount: number;
  private recordCursor: HookRecord | null;
  private openRecord: HookRecord | null;
  private streamFunc: Function;
  private onRequestUpdate: () => void;
  private afterTerminate: (() => void) | null;

  constructor(streamFunc: Function, onRequestUpdate: () => void, afterTerminate: (() => void) | null = null) {
    this.streamFunc = streamFunc;
    this.onRequestUpdate = onRequestUpdate;
    this.afterTerminate = afterTerminate;

    this.hookRecordChain = {
      data: null,
      cleanup: null,
      next: null,
    }; // dummy
    this.recordCursor = null; // only set when this context is updating
    this.openRecord = null;
    this.updateCount = 0;
  }

  update(...args: Array<any>): any {
    // Push a new update frame onto the update stack for this context
    const newFrame = {
      executionContext: this,
      previousFrame: currentUpdateFrame,
    };
    currentUpdateFrame = newFrame;

    // Move hook record cursor to start of chain
    this.recordCursor = this.hookRecordChain;

    let retval;
    try {
      retval = this.streamFunc.apply(null, arguments);

      // This should be null, otherwise there are hook records we didn't get to, and something is amiss
      if (this.recordCursor.next) {
        throw new Error('Did not reach all hook records in update');
      }
    } finally {
      // Pop the top frame from the update stack
      const poppedFrame = currentUpdateFrame;
      if (!poppedFrame) {
        throw new Error('Cannot pop update frame because current is null');
      }
      if (poppedFrame.executionContext !== this) {
        throw new Error("Popped frame from update stack but context did not match");
      }
      currentUpdateFrame = poppedFrame.previousFrame;
    }

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

  _beginHook(): HookRecord {
    if (this.openRecord) {
      throw new Error('This is already an open hook when beginning another');
    }
    if (!this.recordCursor) {
      throw new Error();
    }

    if (this.updateCount === 0) {
      if (this.recordCursor.next) {
        throw new Error('Expecting to create new hook record in chain, but already present');
      }
      // Create new record
      this.recordCursor.next = {
        data: null,
        cleanup: null,
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
    if (!this.recordCursor) {
      throw new Error();
    }
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
  _setStreamFunc(newStreamFunc: Function) {
    this.streamFunc = newStreamFunc;
  }
}

/**
 * Batches solve the problem of having multiple async/external updates that we want to happen
 * simultaneously.
 *
 * For example, say we coalesce event handlers, so that we can have e.g. mouseDown() called in
 * various places in the program, but all the calls hook in to a single shared event handler.
 * Then when the mouse state changes, there may be many different activations in the program
 * calling requestUpdate() when the shared event handler "broadcasts" out to them. But we want
 * the program to re-evaluate in one batch, not successively for each requestUpdate() call.
 * So in that situation, the shared handler should first beginBatch(), then broadcast out to
 * each activation (each of which calls requestUpdate), and then call endBatch(). When endBatch()
 * is called, a single update will happen that treats all of the mouse changes as synchronous.
 *
 * Another example is when we are live-editing a function definition and that function has many
 * activations (e.g. it is an argument to a streamMap). When we make a change to the function
 * definition, we can do it in a batch so that there is only one update.
 */

interface Batch {
  callbacks: Set<() => void>;
}
let currentBatch: Batch | null = null;

export function beginBatch(): void {
  if (currentBatch) {
    throw new Error('cannot begin batch when one is already active');
  }

  currentBatch = {
    callbacks: new Set(),
  };
}

export function endBatch(): void {
  if (!currentBatch) {
    throw new Error('cannot end batch when none is active');
  }

  currentBatch.callbacks.forEach(cb => { cb() });

  currentBatch = null;
}

export function enqueueBatchedUpdate(callback: () => void) {
  if (currentBatch) {
    currentBatch.callbacks.add(callback);
  } else {
    // NOTE: If there is no current batch, we just call the callback immediately
    callback();
  }
}

export function createNullaryVoidRootExecutionContext(streamFunc: Function): ExecutionContext {
  const onRequestUpdate = () => {
    enqueueBatchedUpdate(() => {
      ctx.update();
    });
  };

  const ctx = new ExecutionContext(streamFunc, onRequestUpdate)
  return ctx;
}

/**
 * This is used by hooks to get the currently updating context (after verifying it is set)
 */
function getTopUpdatingExecutionContext(): ExecutionContext {
  if (!currentUpdateFrame) {
    throw new Error('Cannot get currently updating execution context because update stack is empty. Was a hook called outside of an execution context update?');
  }
  return currentUpdateFrame.executionContext;
}

/**
 * If initVal is a function, it will be called on first update to generate initial value.
 */
export function useVar<T>(initVal: T | (() => T)): {current: T} {
  const ctx = getTopUpdatingExecutionContext();
  const record = ctx._beginHook();

  // Create value box if necessary
  if (!record.data) {
    const actualInitVal: T = (initVal instanceof Function) ? initVal() : initVal;
    record.data = {current: actualInitVal};
  }

  ctx._endHook();

  return record.data;
}

/**
 * Why do we need a hook? Why can't we just call ctx.requestUpdate()? Because the requestUpdate
 * function that we return will often be called without there being any updating execution context
 * (e.g. from an event handler). So it has to be bound to the correct context.
 */
export function useRequestUpdate(): () => void {
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

export function useInitialize(initializer: () => (void | (() => void))): void {
  const ctx = getTopUpdatingExecutionContext();
  const record = ctx._beginHook();

  // Initialize if necessary
  if (!record.data) {
    // data being undefined means this is the first call

    record.cleanup = initializer() || null;

    record.data = {}; // no data to store yet, just needs to be truthy to indicate that initialization ran
  }

  ctx._endHook();
}

export interface EventStream<T> {
  subscribe: (onValue: (v: T) => void) => (() => void);
}

export function useEventEmitter<T>() : [EventStream<T>, (v: T) => void] {
  const ctx = getTopUpdatingExecutionContext();
  const record = ctx._beginHook();

  // Initialize record data if necessary
  if (!record.data) {
    const subscribers = new Set<(v: T) => void>();

    const stream: EventStream<T> = {
      subscribe: (onValue) => {
        subscribers.add(onValue);
        return () => { // unsubscribe
          subscribers.delete(onValue);
        };
      }
    }

    const emit = (value: T) => {
      subscribers.forEach(sub => {
        sub(value);
      });
    };

    record.data = {
      stream,
      emit,
    }
  }

  ctx._endHook();

  return [record.data.stream, record.data.emit];
}

export function useEventReceiver<T>(stream: EventStream<T>): {value: T} | undefined {
  interface RecordData {
    queue: T[],
    lastStream: EventStream<T> | null,
    unsubscribe: (() => void) | null,
    onValue: (value: T) => void,
  };

  const ctx = getTopUpdatingExecutionContext();
  const record = ctx._beginHook();

  // Initialize record data if necessary
  if (!record.data) {
    const queue: T[] = [];

    const data: RecordData = {
      queue,
      lastStream: null,
      unsubscribe: null,
      onValue: (value: T) => {
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
  const recordData = <RecordData> record.data;
  if (stream !== recordData.lastStream) {
    // Stream changed identity

    // I _think_ we want to disallow this, since semantics are unclear
    if (recordData.queue.length) {
      throw new Error('useEventReceiver stream changed, but value is in queue');
    }

    if (recordData.lastStream) {
      if (!recordData.unsubscribe) {
        throw new Error('should not be possible');
      }
      recordData.unsubscribe();
      recordData.lastStream = null;
      recordData.unsubscribe = null;
    }

    // TODO: We could validate that it's either undefined or null or a valid stream object
    recordData.lastStream = stream;
    if (stream) {
      recordData.unsubscribe = stream.subscribe(recordData.onValue);
    }
  } else {
    // Stream did not change identity. Check if there is an value in the queue
    if (recordData.queue.length) {
      if (recordData.queue.length > 1) {
        throw new Error('useEventReceiver found more than one enqueued value');
      }

      const eventValue = <T> recordData.queue.pop(); // assertion is OK because we verified length is 1
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
export function useDynamic(streamFunc: Function, onRequestUpdate: () => void) {
  const ctx = getTopUpdatingExecutionContext();
  const record = ctx._beginHook();

  // Initialize record data if necessary
  if (!record.data) {
    // If no onRequestUpdate is provided, default to requesting update on the current context
    const oru = onRequestUpdate || (() => {
      ctx._requestUpdate();
    });

    const data = {
      // Track ExecutionContexts created (and not yet terminated) so we can terminate them upon cleanup
      activeContexts: new Set<ExecutionContext>(),

      // Create "factory" function to instantiate new contexts
      createContext: (): ExecutionContext => {
        const ctx = new ExecutionContext(data.streamFunc, oru, () => { data.activeContexts.delete(ctx); });
        data.activeContexts.add(ctx);
        return ctx;
      },

      streamFunc: () => { throw new Error('should be unreachable') }, // initialize with dummy to satisfy TS, gets set properly below
    };


    record.data = data;
    record.cleanup = () => {
      data.activeContexts.forEach(ctx => ctx.terminate());
    };
  }

  // Update the stream function in record and all active contexts.
  record.data.streamFunc = streamFunc;
  record.data.activeContexts.forEach((ctx: ExecutionContext) => {
    ctx._setStreamFunc(streamFunc);
  });

  ctx._endHook();

  return record.data.createContext;
}

/**
 * NOTE: reducerFunc should be pure-pointwise, NOT a stream func
 * If initialState is a function, it will be called on first update to generate initial state.
 */
export function useReducer<S, A>(evts: EventStream<A>, reducerFunc: (state: S, action: A) => S, initialState: S | (() => S)): S {
  const state = useVar(initialState);
  const evt = useEventReceiver(evts);
  if (evt) {
    state.current = reducerFunc(state.current, evt.value);
  }
  return state.current;
}

/**
 * NOTE: streamReducerPairs must not change length.
 */
export function useReducers<S, A>(streamReducerPairs: Array<[EventStream<A>, (state: S, action: A) => S]>, initialState: S | (() => S)): S {
  const state = useVar(initialState);

  const numStreams = useVar(streamReducerPairs.length);
  if (streamReducerPairs.length !== numStreams.current) {
    // NOTE: We could allow this with some extra work
    throw new Error('The number of streams/reducers supplied to useMultiReducer cannot change');
  }

  // It's safe to call hook in this loop because we made sure that the length is the same
  let evtCount = 0;
  for (const [evts, reducer] of streamReducerPairs) {
    const evt = useEventReceiver(evts);
    if (evt) {
      if (evtCount > 0) {
        // TODO: We _could_ handle these sequentially.. should we have a flag that says whether to allow or not?
        throw new Error('useMultiReducer got multiple events, cannot merge');
      }
      state.current = reducer(state.current, evt.value);
      evtCount++;
    }
  }

  return state.current;
}

/**
 * NOTE: reducerFunc should be pure-pointwise, NOT a stream func
 * If initialState is a function, it will be called on first update to generate initial state.
 */
export function useCallbackReducer<S, A>(reducerFunc: (state: S, action: A) => S, initialState: S | (() => S)): [S, (action: A) => void] {
  const requestUpdate = useRequestUpdate();
  const state = useVar(initialState);
  // We cache the callback, though I don't think we really need to?
  const callback = useVar(() => (action: A) => {
    state.current = reducerFunc(state.current, action);
    requestUpdate();
  });
  return [state.current, callback.current];
}

export function useCallbackReducers<S, A>(reducerFuncs: Array<(state: S, action: A) => S>, initialState: S | (() => S)): [S, Array<(action: A) => void>] {
  const requestUpdate = useRequestUpdate();
  const state = useVar(initialState);
  const callbacks = reducerFuncs.map(reducerFunc => (action: A) => {
    state.current = reducerFunc(state.current, action);
    requestUpdate();
  });
  return [state.current, callbacks];
}

/**
 * TODO: Could/should this take an optional onRequestUpdate parameter?
 */
export function useMachine(states: {[index: string]: (arg: any) => [string, any]}, initialTransition: [string, any]) {
  const ctx = getTopUpdatingExecutionContext();
  const record = ctx._beginHook();

  const takeTransition = (trans: [string, any]) => {
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
    const data: {
      activeContext: ExecutionContext | null,
    } = {
      activeContext: null,
    };
    record.data = data;

    takeTransition(initialTransition); // this will set stuff in record.data

    record.cleanup = () => {
      if (!data.activeContext) { throw new Error('should have been initialized'); }
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
