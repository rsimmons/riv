// NOTE: Using require instead of import here makes the thing where we print program text work better.
const { useVar, useRequestUpdate, useInitialize, useEventEmitter, useEventReceiver, useDynamic } = require('./chinook');

function displayAsString(v) {
  const elem = useVar(null);

  useInitialize(() => {
    elem.current = document.createElement('div');
    elem.current.style.cssText = 'position: absolute; top: 0; right: 0; pointer-events: none; background: white; border: 1px solid red; color: black; font-size: 24px; padding: 5px';
    elem.current.textContent = '(undefined)';
    document.body.appendChild(elem.current);

    return () => { // cleanup
      document.body.removeChild(elem.current);
    }
  })

  elem.current.textContent = (v === undefined) ? '(undefined)' : v.toString();
}

function animationTime() {
  const requestUpdate = useRequestUpdate();
  const time = useVar();
  const reqId = useVar();

  useInitialize(() => {
    const onFrame = (t) => {
      time.current = 0.001*t;
      reqId.current = requestAnimationFrame(onFrame); // request another
      requestUpdate();
    };

    time.current = 0.001*performance.now();
    reqId.current = requestAnimationFrame(onFrame);

    return () => { // cleanup
      cancelAnimationFrame(reqId.current);
    }
  });

  return time.current;
}

function animationFrameEvts() {
  const requestUpdate = useRequestUpdate();
  const reqId = useVar();
  const [frameEvts, emitFrame] = useEventEmitter();

  useInitialize(() => {
    const onFrame = (t) => {
      emitFrame();
      reqId.current = requestAnimationFrame(onFrame); // request another
      requestUpdate();
    };

    reqId.current = requestAnimationFrame(onFrame);

    return () => { // cleanup
      cancelAnimationFrame(reqId.current);
    }
  });

  return frameEvts;
}

function countEvents(evts) {
  const count = useVar(0);
  const event = useEventReceiver(evts);

  if (event) {
    count.current++;
  }

  return count.current;
}

function mouseClickEvts() {
  const requestUpdate = useRequestUpdate();
  const [clickEvts, emitClick] = useEventEmitter();

  useInitialize(() => {
    const onMouseDown = () => {
      emitClick();
      requestUpdate();
    }
    document.addEventListener('mousedown', onMouseDown);

    return () => { // cleanup
      document.removeEventListener('mousedown', onMouseDown);
    }
  });

  return clickEvts;
}

function mouseDown() {
  const requestUpdate = useRequestUpdate();
  const isDown = useVar(false); // we can't poll down-ness, so we assume it's initially not down

  useInitialize(() => {
    const onMouseDown = () => {
      isDown.current = true;
      requestUpdate();
    }
    const onMouseUp = () => {
      isDown.current = false;
      requestUpdate();
    }

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);

    return () => { // cleanup
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
    }
  });

  return isDown.current;
}

function random(repickEvts) {
  const val = useVar(Math.random());
  const repick = useEventReceiver(repickEvts);

  if (repick) {
    val.current = Math.random();
  }

  return val.current;
}

function audioDriver(generator) {
  const createGenerator = useDynamic(generator);
  const generatorCtx = useVar();
  const frameCount = useVar(0);
  const sampleRate = useVar();
  const [advanceFrameEvts, emitAdvanceFrame] = useEventEmitter();

  useInitialize(() => {
    generatorCtx.current = createGenerator();

    const BUFFER_SIZE = 1024;
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const scriptNode = audioContext.createScriptProcessor(BUFFER_SIZE, 0, 1); // 0 input channels, 1 output channel
    scriptNode.onaudioprocess = (e) => {
      const buffer = e.outputBuffer.getChannelData(0);
      for (let i = 0; i < buffer.length; i++) {
        emitAdvanceFrame({});
        buffer[i] = generatorCtx.current.update(frameCount.current/sampleRate.current, advanceFrameEvts);
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
  generatorCtx.current.update(frameCount.current/sampleRate.current, advanceFrameEvts); // NOTE: we discard retval
}

function sampleUpon(toSample, uponEvts, initialValue) {
  const held = useVar(initialValue);
  const upon = useEventReceiver(uponEvts);

  if (upon) {
    held.current = toSample;
  }

  return held.current;
}

function everySecond() {
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

export default [
  {
    name: 'do nothing',
    main: () => {
    },
  },

  {
    name: 'animation time',
    main: () => {
      displayAsString(animationTime().toFixed(3));
    },
  },

  {
    name: 'count clicks',
    main: () => {
      displayAsString(countEvents(mouseClickEvts()));
    },
  },

  {
    name: 'is mouse button down',
    main: () => {
      displayAsString(mouseDown());
    },
  },

  {
    name: 'random number, click to repick',
    main: () => {
      displayAsString(random(mouseClickEvts()));
    },
  },

  {
    name: 'audio noise when mouse is down',
    main: () => {
      const md = mouseDown();
      audioDriver((audioTime, advanceFrameEvts) => {
        const noise = random(advanceFrameEvts) - 0.5;
        return md ? noise : 0;
      });
    },
  },

  {
    name: 'decaying noise upon click',
    main: () => {
      const clickEvts = mouseClickEvts();
      audioDriver((audioTime, advanceFrameEvts) => {
        const noise = random(advanceFrameEvts) - 0.5;
        const lastClickTime = sampleUpon(audioTime, clickEvts, -Infinity);
        const decayingGain = Math.exp(5*(lastClickTime - audioTime));
        return decayingGain*noise;
      });
    },
  },

  {
    name: 'resetting frame counter, click to reset',
    main: () => {
      const frameEvts = animationFrameEvts();
      const clickEvts = mouseClickEvts();
      const click = useEventReceiver(clickEvts);
      const createCounter = useDynamic(countEvents);
      const activeCounter = useVar();

      if (click) {
        if (activeCounter.current) {
          activeCounter.current.terminate();
        }
        activeCounter.current = createCounter();
      }
      if (!activeCounter.current) {
        activeCounter.current = createCounter();
      }

      const displayedCount = activeCounter.current.update(frameEvts);
      displayAsString(displayedCount);
    }
  },

  {
    name: 'dynamic array of async clocks, click to add',
    main: () => {
      const clickEvts = mouseClickEvts();
      const click = useEventReceiver(clickEvts);
      const createClock = useDynamic(() => countEvents(everySecond()));
      const clockArray = useVar([]);

      if (click) {
        clockArray.current.push(createClock());
      }

      const nums = clockArray.current.map(clock => clock.update());
      displayAsString(nums.join(' '));
    }
  }
]
