let updatingExecutionContext = null;

class ExecutionContext {
  constructor(mainFunc) {
    this.mainFunc = mainFunc;
    this.hookRecordChain = {next: null}; // dummy
    this.recordCursor = null; // only set when this context is updating
    this.updateCount = 0;
  }

  update() {
    // Set this context to be updating
    if (updatingExecutionContext) {
      throw new Error('Cannot update context since there is already an updating context');
    }
    updatingExecutionContext = this;

    // Move hook record cursor to start of chain
    this.recordCursor = this.hookRecordChain;

    this.mainFunc();

    this.recordCursor = null;

    // Clear updating context
    updatingExecutionContext = null;

    this.updateCount++;
  }

  terminate() {
    // Make sure no context is updating
    if (updatingExecutionContext) {
      throw new Error('Should not terminate context when one is updating');
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

export function createExecutionContext(mainFunc) {
  return new ExecutionContext(mainFunc);
}

/**
 * This is used by hooks to get the currently updating context (after verifying it is set)
 */
function getUpdatingExecutionContext() {
  if (!updatingExecutionContext) {
    throw new Error('Cannot call hook outside of execution context?');
  }

  return updatingExecutionContext;
}

export function useVar(initVal) {
  const ctx = getUpdatingExecutionContext();
  const record = ctx._beginHook();

  // Create value box if necessary
  if (!record.data) {
    record.data = {current: initVal};
  }

  ctx._endHook();

  return record.data;
}

export function useRequestUpdate() {
  const ctx = getUpdatingExecutionContext();
  const record = ctx._beginHook();

  // Create callback if necessary. We store it so that we already return the same one.
  if (!record.data) {
    record.data = {requestUpdate: () => {
      ctx.update();
    }};
  }

  ctx._endHook();

  return record.data.requestUpdate;
}

export function useInitialize(initializer) {
  const ctx = getUpdatingExecutionContext();
  const record = ctx._beginHook();

  // Initialize if necessary
  if (!record.data) {
    // data being undefined means this is the first call

    record.cleanup = initializer();

    record.data = {}; // no data to store yet, just needs to be truthy to indicate that initialization ran
  }

  ctx._endHook();
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
