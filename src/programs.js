import { useVar, useRequestUpdate, useInitialize, useEventEmitter, useEventReceiver } from './chinook';

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
  const frameCount = useVar();
  const requestUpdate = useRequestUpdate();
  const generatingSample = useVar(false);
  const latestAmplitude = useVar(0);
  const sampleRate = useVar();
  const [nextFrameStream, emitNextFrame] = useEventEmitter();

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
    emitNextFrame({});
  }
  const audioTime = frameCount.current / sampleRate.current;
  latestAmplitude.current = generator(audioTime, nextFrameStream);
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
      audioDriver((time, nextFrame) => {
        const noise = random(nextFrame) - 0.5; // centered
        // if (Math.random() < 0.001) { console.log(noise, md); }
        return md ? noise : 0;
      });
    },
  },
]
