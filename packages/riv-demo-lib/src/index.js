const { useVar, useRequestUpdate, useInitialize, useEventEmitter, useEventReceiver, useDynamic, useReducer, useReducers } = require('riv-runtime');
const { renderDOMAppendedToBody, h } = require('riv-snabbdom');

export function showString(v) {
  const vnode = h('div', {style: {
    border: '1px solid red',
    color: 'black',
    fontSize: '24px',
    padding: '5px',
    marginTop: '20px',
  }}, 'showString: ' + ((v === undefined) ? '(undefined)' : v.toString()));

  renderDOMAppendedToBody(vnode);
}

export function animationFrameEvts() {
  const requestUpdate = useRequestUpdate();
  const reqId = useVar();
  const [frameEvts, emitFrame] = useEventEmitter();

  useInitialize(() => {
    const onFrame = (t) => {
      emitFrame(0.001*t);
      requestUpdate();
      reqId.current = requestAnimationFrame(onFrame); // request another
    };

    reqId.current = requestAnimationFrame(onFrame);

    return () => { // cleanup
      cancelAnimationFrame(reqId.current);
    }
  });

  return frameEvts;
}

export function latestValue(evts, initialValue) {
  return useReducer(evts, (_, value) => value, initialValue);
}

function mapEvts(inputEvts) {
  const inputEvt = useEventReceiver(inputEvts);
  const [outputEvts, emitOutput] = useEventEmitter();

  if (inputEvt) {
    emitOutput(inputEvt.value);
  }

  // TODO: We don't need to request update since we are already being updated

  return outputEvts;
}

function mergeEvts(streams) {
  const [outputEvts, emitOutput] = useEventEmitter();

  // TODO: This is a hack that assumes array length never changes
  const evts = [...streams].map(stream => useEventReceiver(stream)).filter(e => e);
  if (evts.length > 1) {
    throw new Error('Failed to merge events since more than one present');
  } else if (evts.length === 1) {
    emitOutput(evts[0].value);
  }

  return outputEvts;
}

export function animationTime() {
  return latestValue(animationFrameEvts(), () => 0.001*performance.now());
}


export function countEvents(evts) {
  return useReducer(evts, previousCount => previousCount+1, 0);
}

function makeAsyncCallback() {
  const [evts, emit] = useEventEmitter();
  const requestUpdate = useRequestUpdate();

  const callback = (...args) => {
    emit(args);
    requestUpdate();
  };

  return [callback, evts];
}

function domEvts(eventTarget, type, extra) {
  // TODO: We should cache type/extra
  const requestUpdate = useRequestUpdate();
  const [evts, emit] = useEventEmitter();

  useInitialize(() => {
    const onEvent = (e) => {
      emit(e);
      requestUpdate();
    }
    document.addEventListener(type, onEvent, extra);

    return () => { // cleanup
      document.removeEventListener(type, onEvent, extra);
    }
  });

  return evts;
}

export function mouseClickEvts() {
  return domEvts(document, 'mousedown');
}

export function mouseDown() {
  const downEvts = domEvts(document, 'mousedown');
  const upEvts = domEvts(document, 'mouseup');

  return useReducers([
    [upEvts, () => false],
    [downEvts, () => true],
  ], false); // We can't poll down-ness, so we assume it's initially not down
}

export function mousePosition() {
  return latestValue(mapEvts(domEvts(document, 'mousemove'), e => ({x: e.clientX || e.pageX, y: e.clientY || e.pageY})), {x: 0, y: 0});
}

export function random(repickEvts) {
  return useReducer(repickEvts, () => Math.random(), () => Math.random());
}

export function audioDriver(generator) {
  const createGenerator = useDynamic(generator);
  const generatorCtx = useVar();
  const frameCount = useVar(0);
  const sampleRate = useVar();
  const [advanceFrameEvts, emitAdvanceFrameEvt] = useEventEmitter();

  useInitialize(() => {
    generatorCtx.current = createGenerator();

    const BUFFER_SIZE = 1024;
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const scriptNode = audioContext.createScriptProcessor(BUFFER_SIZE, 0, 1); // 0 input channels, 1 output channel
    scriptNode.onaudioprocess = (e) => {
      const buffer = e.outputBuffer.getChannelData(0);
      for (let i = 0; i < buffer.length; i++) {
        emitAdvanceFrameEvt();
        let frameVal = generatorCtx.current.update(frameCount.current/sampleRate.current, advanceFrameEvts, sampleRate.current);
        if (!frameVal ||  Number.isNaN(frameVal)) {
          frameVal = 0;
        } else if (frameVal > 1) {
          frameVal = 1;
        } else if (frameVal < -1) {
          frameVal = -1;
        }
        buffer[i] = frameVal;
        frameCount.current++;
      }
    };
    scriptNode.connect(audioContext.destination);

    sampleRate.current = audioContext.sampleRate;

    return () => {
      scriptNode.disconnect();
      audioContext.close();
    };
  });

  /**
   * Most of our generator updating will happen in the audio processing callback above.
   * This update here is for when the audioDriver update is called, e.g. when an outer scope
   * reference that the generator depends on has changed. So we must update the generator,
   * but don't need its output amplitude.
   */
  generatorCtx.current.update(frameCount.current/sampleRate.current, advanceFrameEvts, sampleRate.current); // NOTE: we discard retval
}

export function sampleUpon(toSample, uponEvts, initialValue) {
  return useReducer(uponEvts, () => toSample, initialValue);
}

export function everySecond() {
  const requestUpdate = useRequestUpdate();
  const [tickEvts, emitTick] = useEventEmitter();

  useInitialize(() => {
    const onInterval = () => {
      emitTick();
      requestUpdate();
    }
    const timerId = setInterval(onInterval, 1000);

    return () => { // cleanup
      clearInterval(timerId);
    }
  });

  return tickEvts;
}

/**
 * Until audio is loaded and decoded, a single-sample buffer of silence is returned.
 */
export function loadAudioAsArray(url) {
  const requestUpdate = useRequestUpdate();
  const pcm = useVar([0]); // until loaded, just return single sample of silence

  useInitialize(() => {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    let cleanedUp = false;

    const request = new XMLHttpRequest();
    request.open('GET', url, true);
    request.responseType = 'arraybuffer';
    request.onload = () => {
      const audioData = request.response;
      audioCtx.decodeAudioData(audioData, buffer => {
        if (!cleanedUp) {
          pcm.current = buffer.getChannelData(0);
          requestUpdate();
        }
      });
    };

    request.send();

    return () => { // cleanup
      request.abort(); // it's safe to always abort here. if already completed, it will be ignored

      // decodeAudioData cannot be canceled. So to be correct, we must set a flag here to make sure
      // that decoding is ignored
      cleanedUp = true;
    }
  });

  return pcm.current;
}

function consoleLog(v) {
  console.log(v);
}

export function integral(integrandFunc, time, initialValue = 0) {
  const accum = useVar(initialValue);
  const prevTime = useVar(time);

  const integrand = integrandFunc(accum.current, prevTime.current);
  accum.current += (time - prevTime.current)*integrand;

  prevTime.current = time;

  return accum.current;
}

export function expFollow(targetValue, speedConstant, time, initialValue) {
  return integral(currentValue => speedConstant*(targetValue - currentValue), time, initialValue);
}

export function redCircle(position, radius = 25) {
  const p = position || {x: 0, y: 0};
  if (radius < 0) {
    radius = 0;
  }
  const halfRadius = 0.5*radius;

  const vnode = h('div', {style: {
    position: 'absolute',
    borderRadius: '50%',
    background: 'red',
    pointerEvents: 'none',
    userSelect: 'none',
    left: (p.x - halfRadius) + 'px',
    top: (p.y - halfRadius) + 'px',
    width: radius + 'px',
    height: radius + 'px',
  }});

  renderDOMAppendedToBody(vnode);
}

export function followAtSpeed2d(target, speed, time, initial) {
  const pos = useVar(initial);
  const prevTime = useVar(time);

  const dt = time - prevTime.current;
  const delta = {x: target.x-pos.current.x, y: target.y-pos.current.y};
  const dist = Math.sqrt(delta.x*delta.x + delta.y*delta.y);
  if (speed*dt >= dist) {
    // Jump to target position
    pos.current = target;
  } else {
    // NOTE: We must not mutate pos.current, since we return that
    pos.current = {
      x: pos.current.x + dt*speed*delta.x/dist,
      y: pos.current.y + dt*speed*delta.y/dist,
    };
  }

  prevTime.current = time;

  return pos.current;
}

/**
 * Note that this _will_ fire in first call if condition starts truthy
 */
function eventWhen(condition, valueToEmit) {
  const prevCondition = useVar(false);

  const bcond = !!condition;

  const retval = (bcond && !prevCondition.current) ? {value: valueToEmit} : undefined;
  prevCondition.current = bcond;

  return retval;
}

/**
 * Note that seconds argument is only read initially. But valueToEmit is re-read on changes
 */
export function eventAfter(seconds, valueToEmit) {
  const [evts, emit] = useEventEmitter();
  const value = useVar(valueToEmit);

  value.current = valueToEmit;

  useInitialize(() => {
    const timerId = setTimeout(() => {
      emit(value.current);
    }, 1000*seconds);
    return () => {
      clearTimeout(timerId);
    };
  });

  return evts;
}

export function received(evts) {
  return useReducer(evts, (previousState, event) => true, false);
}

/**
 * F is a stream function that must stay hook-equivalent.
 */
export function streamMap(f, arr = []) {
  const createFContext = useDynamic(f);
  const fContexts = useVar([]);

  // Create or destrooy contexts as needed to match arr length
  while (arr.length > fContexts.current.length) {
    fContexts.current.push(createFContext());
  }
  while (arr.length < fContexts.current.length) {
    const ctx = fContexts.current.pop();
    ctx.terminate();
  }

  const outs = fContexts.current.map((ctx, i) => ctx.update(arr[i]));

  return outs;
}

function robustEquals(a, b) {
  if (Number.isNaN(a) && Number.isNaN(b)) {
    return true;
  }

  return a === b;
}

export function changeCount(s) {
  const count = useVar(0);
  const previous = useVar(s);

  if (!robustEquals(s, previous.current)) {
    count.current++;
  }
  previous.current = s;

  return count.current;
}
