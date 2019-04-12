import dom from './dom';
// NOTE: Using require instead of import here makes the thing where we print program text work better.
const { useVar, useRequestUpdate, useInitialize, useEventEmitter, useEventReceiver, useDynamic, useReducer, useMachine } = require('./riv');
const { renderDOMIntoSelector, renderDOMAppendedToBody, h } = require('./dom');
const amen_break_url = require('./amen_break.mp3');

function showString(v) {
  const vnode = h('div', {style: {
    border: '1px solid red',
    color: 'black',
    fontSize: '24px',
    padding: '5px',
    marginTop: '20px',
  }}, 'showString: ' + ((v === undefined) ? '(undefined)' : v.toString()));

  renderDOMAppendedToBody(vnode);
}

function animationFrameEvts() {
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

function latestValue(evts, initialValue) {
  return useReducer(evts, (value) => value, initialValue);
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

function animationTime() {
  return latestValue(animationFrameEvts(), 0.001*performance.now()); // TODO: use thunk for iv
}


function countEvents(evts) {
  return useReducer(evts, (action, previousCount) => previousCount+1, 0);
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

function mouseClickEvts() {
  return domEvts(document, 'click');
}

function mouseDown() {
  const downEvts = domEvts(document, 'mousedown');
  const upEvts = domEvts(document, 'mouseup');
  // We can't poll down-ness, so we assume it's initially not down
  return useReducer(mergeEvts([downEvts, upEvts]), e => (e.type === 'mousedown'), false);
}

function mousePosition() {
  return latestValue(mapEvts(domEvts(document, 'mousemove'), e => ({x: e.clientX || e.pageX, y: e.clientY || e.pageY})), {x: 0, y: 0});
}

function random(repickEvts) {
  return useReducer(repickEvts, () => Math.random(), Math.random());
}

function audioDriver(generator) {
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
        buffer[i] = generatorCtx.current.update(frameCount.current/sampleRate.current, advanceFrameEvts, sampleRate.current);
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

function sampleUpon(toSample, uponEvts, initialValue) {
  return useReducer(uponEvts, () => toSample, initialValue);
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

/**
 * Until audio is loaded and decoded, a single-sample buffer of silence is returned.
 */
function loadAudioAsArray(url) {
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

function integral(integrandFunc, time, initialValue = 0) {
  const accum = useVar(initialValue);
  const prevTime = useVar(time);

  const integrand = integrandFunc(accum.current, prevTime.current);
  accum.current += (time - prevTime.current)*integrand;

  prevTime.current = time;

  return accum.current;
}

function expFollow(targetValue, speedConstant, time, initialValue) {
  return integral(currentValue => speedConstant*(targetValue - currentValue), time, initialValue);
}

function redCircle(position, radius = 25) {
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

function followAtSpeed2d(target, speed, time, initial) {
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
function eventAfter(seconds, valueToEmit) {
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

function received(evts) {
  return useReducer(evts, (action, previousState) => true, false);
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
      showString(animationTime().toFixed(3));
    },
  },

  {
    name: 'count clicks',
    main: () => {
      showString(countEvents(mouseClickEvts()));
    },
  },

  {
    name: 'is mouse button down',
    main: () => {
      showString(mouseDown());
    },
  },

  {
    name: 'random number, click to repick',
    main: () => {
      showString(random(mouseClickEvts()));
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
      showString(nums.join(' '));
    }
  },

  {
    name: 'record player spin up/down, hold mouse down and release',
    main: () => {
      const pcm = loadAudioAsArray(amen_break_url);
      showString(pcm.length > 1 ? 'loaded audio' : 'loading audio...');
      audioDriver((audioTime, advanceFrameEvts, sampleRate) => {
        const targetSpeed = mouseDown() ? sampleRate : 0;
        const speed = expFollow(targetSpeed, 3, audioTime, 0);
        const pos = Math.floor(integral(() => speed, audioTime));
        return pcm[pos % pcm.length]; // modulo so as to loop
      });
    }
  },

  {
    name: 'circle follows mouse',
    main: () => {
      redCircle(mousePosition());
    }
  },

  {
    name: 'circle follows mouse at limited speed',
    main: () => {
      const time = animationTime();
      const mpos = mousePosition();
      redCircle(followAtSpeed2d(mpos, 300, time, mpos));
    }
  },

  {
    name: 'circle moves halfway to mouse with each click',
    main: () => {
      const midpoint = (a, b) => ({x: 0.5*(a.x+b.x), y: 0.5*(a.y+b.y)});
      const mpos = mousePosition();
      const clickEvts = mouseClickEvts();
      const cpos = useReducer(clickEvts, (_, prevState) => midpoint(prevState, mpos), {x: 0, y: 0});
      redCircle(cpos);
    }
  },

  {
    name: 'roaming circle (state machine)',
    main: () => {
      const time = animationTime();
      const position = useMachine({
        moving: (initialPosition) => {
          const targetPosition = {x: 500*random(), y: 500*random()};
          const position = followAtSpeed2d(targetPosition, 300, time, initialPosition);
          const arrived = (position.x === targetPosition.x) && (position.y === targetPosition.y);
          return [
            position,
            arrived ? ['resting', position] : null,
          ];
        },
        resting: (initialPosition) => {
          return [
            initialPosition,
            received(eventAfter(random())) ? ['moving', initialPosition] : null
          ];
        },
      }, ['moving', {x: 0, y: 0}]);
      redCircle(position);
    }
  },

  {
    name: 'resetting frame counter, click to reset',
    main: () => {
      const frameEvts = animationFrameEvts();
      const clickEvt = mouseClickEvts();

      // We use a single-state state machine to achieve reseting behavior
      const count = useMachine({
        single: () => {
          return [
            countEvents(frameEvts),
            received(clickEvt) ? ['single'] : null,
          ];
        }
      }, ['single']);

      showString(count);
    }
  },

  /* ALTERNATE JSX VERSION FOR BELOW
    const vnode = (
      <div>
        <span>{label} {value}{unit}</span>
        <input type="range" min={min} max={max} value={value} on-input={inputCallback} />
      </div>
    );
  */
  {
    name: 'BMI calculator (DOM)',
    main: () => {
      // Based off https://jsbin.com/seqehat/2/edit?js,output for comparison
      const LabeledSlider = (label, unit, min, initialValue, max) => {
        const [inputCallback, inputEvts] = makeAsyncCallback();
        const value = useReducer(inputEvts, ([e], prevState) => e.target.value, initialValue);

        const vnode = h('div', [
          h('span', label + ' ' + value + unit),
          h('input', {attrs: {type: 'range', min, max, value}, on: {input: inputCallback}})
        ]);

        return [vnode, value];
      };

      const [weightNode, weight] = LabeledSlider('Weight', 'kg', 40, 70, 150);
      const [heightNode, height] = LabeledSlider('Height', 'cm', 140, 170, 210);

      const heightMeters = 0.01*height;
      const bmi = Math.round(weight / (heightMeters*heightMeters));
      const uiNode = h('div', [
        weightNode,
        heightNode,
        h('h2', 'BMI is ' + bmi)
      ]);

      renderDOMIntoSelector(uiNode, '#output');
    }
  },
]
