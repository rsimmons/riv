let updatingExecutionContextStack = [];

class ExecutionContext {
  constructor(streamFunc, isRoot=false) {
    this.streamFunc = streamFunc;
    this.isRoot = isRoot;
    this.hookRecordChain = {next: null}; // dummy
    this.recordCursor = null; // only set when this context is updating
    this.updateCount = 0;
  }

  update() {
    // Push this context onto the stack
    if (this.isRoot && updatingExecutionContextStack.length !== 0) {
      throw new Error('Went to update root context but stack is not empty');
    }
    updatingExecutionContextStack.push(this);

    // Move hook record cursor to start of chain
    this.recordCursor = this.hookRecordChain;

    this.streamFunc();

    // This should be null, otherwise there are hook records we didn't get to, and something is amiss
    if (this.recordCursor.next) {
      throw new Error('Did not reach all hook records in update');
    }

    // Pop this context from the stack, making sure it is the top entry.
    if (!updatingExecutionContextStack.length || (updatingExecutionContextStack[updatingExecutionContextStack.length-1] !== this)) {
      throw new Error('Cannot pop context because it is not at top of stack');
    }
    updatingExecutionContextStack.pop();
    if (this.isRoot && updatingExecutionContextStack.length !== 0) {
      throw new Error('Popped root context but stack is not empty');
    }

    this.updateCount++;
  }

  terminate() {
    // I'm not sure if we need to check this, but let's verify that this context isn't anywhere in the stack
    for (const ctx of updatingExecutionContextStack) {
      if (ctx === this) {
        throw new Error('Should not be terminating context that is in updating stack');
      }
    }

    // Call any cleanup functions set by hooks
    // TODO: Do we need to worry about order?
    for (let c = this.hookRecordChain.next; c; c = c.next) {
      if (c.cleanup) {
        c.cleanup();
      }
    }
  }

  _beginHook() {
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

    return this.recordCursor.next;
  }

  _endHook() {
    this.recordCursor = this.recordCursor.next; // move cursor forward
  }
}

export function createRootExecutionContext(streamFunc) {
  return new ExecutionContext(streamFunc, true);
}

/**
 * This is used by hooks to get the currently updating context (after verifying it is set)
 */
function getTopUpdatingExecutionContext() {
  if (!updatingExecutionContextStack.length) {
    throw new Error('Cannot call hook outside of execution context?');
  }

  return updatingExecutionContextStack[updatingExecutionContextStack.length-1];
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

export function useRequestUpdate() {
  const ctx = getTopUpdatingExecutionContext();
  const record = ctx._beginHook();

  // Create callback if necessary. We store it so that we already return the same one.
  if (!record.data) {
    record.data = {requestUpdate: () => {
      ctx.update(); // it's important that we use ctx from closure, not getTopUpdatingExecutionContext() here
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
    const stream = {
      count: 0, // how many events have occurred on this stream
      latestValue: undefined,
    }

    record.data = {
      stream,
      emit: (value) => {
        // This function closes over the stream variable
        stream.latestValue = value;
        stream.count++;
      },
    };
  }

  ctx._endHook();

  return [record.data.stream, record.data.emit];
}

export function useEventReceiver(stream) {
  const ctx = getTopUpdatingExecutionContext();
  const record = ctx._beginHook();

  // Initialize record data if necessary
  if (!record.data) {
    record.data = {
      stream, // the stream we are receiving on
      lastSeenNumber: stream.count,
    };
  }

  // TODO: We could support this, just need to consider details.
  if (stream !== record.data.stream) {
    throw new Error('Event receiver found that stream object changed identity');
  }

  let boxedEvent;

  if (record.data.lastSeenNumber === stream.count) {
    // There have not been any new events on the stream
  } else if (record.data.lastSeenNumber === (stream.count - 1)) {
    // There has been exactly one new event on the stream that we haven't seen yet.
    boxedEvent = {value: stream.latestValue};
    record.data.lastSeenNumber++;
  } else {
    throw new Error('Event receiver got too many events or missed some');
  }

  ctx._endHook();

  return boxedEvent;
}

/**
 * Runs inner function with callback that lets it do an async output.
 * Upon async output, does a requestUpdate and "queues" the output value.
 * Upon the next (requested) update,
 */
/*
export function useAsync(inner) {
  const requestUpdate = useRequestUpdate();
  const queuedOutput = useVar();

  if (queuedOutput.current !== undefined) {
    const qv = queuedOutput.current;
    queuedOutput.current = undefined;
    return qv;
  }

  return inner((outputValue) => {
    if (queuedOutput.current !== undefined) {
      throw new Error('this should not happen');
    }
    queuedOutput.current = outputValue;
  });
}
*/
