import { useVar, useRequestUpdate, useInitialize, useEventEmitter, useEventReceiver, useDynamic } from './chinook';

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

function animationFrames() {
  const requestUpdate = useRequestUpdate();
  const reqId = useVar();
  const [frameStream, emitFrame] = useEventEmitter();

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

  return frameStream;
}

function countEvents(es) {
  const count = useVar(0);
  const boxedEvent = useEventReceiver(es);

  if (boxedEvent) {
    count.current++;
  }

  return count.current;
}

function mouseClicks() {
  const requestUpdate = useRequestUpdate();
  const [clickStream, emitClick] = useEventEmitter();

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

  return clickStream;
}

function mouseDown() {
  const requestUpdate = useRequestUpdate();
  const isDown = useVar(false); // we can't poll down-ness, so we assume it's not down

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

function random(repick) {
  const val = useVar(Math.random());
  const repickEvent = useEventReceiver(repick);

  if (repickEvent) {
    val.current = Math.random();
  }

  return val.current;
}

function audioDriver(generator) {
  const frameCount = useVar(0);
  const requestUpdate = useRequestUpdate();
  const generatingSample = useVar(false);
  const latestAmplitude = useVar(0);
  const sampleRate = useVar();
  const [advanceFrameStream, emitAdvanceFrame] = useEventEmitter();

  useInitialize(() => {
    const BUFFER_SIZE = 1024;
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const scriptNode = audioContext.createScriptProcessor(BUFFER_SIZE, 0, 1); // 0 input channels, 1 output channel
    scriptNode.onaudioprocess = (e) => {
      const buffer = e.outputBuffer.getChannelData(0);
      for (let i = 0; i < buffer.length; i++) {
        generatingSample.current = true;
        requestUpdate(); // NOTE: This is synchronous! The audioDriver function will be called before this returns
        generatingSample.current = false;

        buffer[i] = latestAmplitude.current;
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

  if (generatingSample.current) {
    emitAdvanceFrame({});
  }
  const audioTime = frameCount.current / sampleRate.current;
  latestAmplitude.current = generator(audioTime, advanceFrameStream);
}

function sampleUpon(toSample, upon, initialValue) {
  const held = useVar(initialValue);
  const uponEvent = useEventReceiver(upon);

  if (uponEvent) {
    held.current = toSample;
  }

  return held.current;
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
      displayAsString(animationTime());
    },
  },

  {
    name: 'count clicks',
    main: () => {
      displayAsString(countEvents(mouseClicks()));
    },
  },

  {
    name: 'mouse button down',
    main: () => {
      displayAsString(mouseDown());
    },
  },

  {
    name: 'random number, click to repick',
    main: () => {
      displayAsString(random(mouseClicks()));
    },
  },

  {
    name: 'audio noise when mouse is down',
    main: () => {
      const md = mouseDown();
      audioDriver((audioTime, advanceFrame) => {
        const noise = random(advanceFrame) - 0.5;
        return md ? noise : 0;
      });
    },
  },

  {
    name: 'decaying noise upon click',
    main: () => {
      const clicks = mouseClicks();
      audioDriver((audioTime, advanceFrame) => {
        const noise = random(advanceFrame) - 0.5;
        const lastClickTime = sampleUpon(audioTime, clicks, -Infinity);
        const decayingGain = Math.exp(5*(lastClickTime - audioTime));
        return decayingGain*noise;
      });
    },
  },

  {
    name: 'resetting frame counter (useDynamic)',
    main: () => {
      const frames = animationFrames();
      const clicks = mouseClicks();
      const clickEvent = useEventReceiver(clicks);
      const createCounter = useDynamic(countEvents);
      const activeCounter = useVar();

      if (clickEvent) {
        if (activeCounter.current) {
          activeCounter.current.terminate();
        }
        activeCounter.current = createCounter();
      }
      if (!activeCounter.current) {
        activeCounter.current = createCounter();
      }

      const displayedCount = activeCounter.current.update(frames);
      displayAsString(displayedCount);
    }
  }
]
