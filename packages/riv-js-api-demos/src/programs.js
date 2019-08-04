const { useReducer, useCallbackReducer, useCallbackReducers, useMachine } = require('riv-runtime');
const { showString, animationTime, countEvents, mouseClickEvts, mouseDown, random, audioDriver, streamMap, everySecond, redCircle, mousePosition, followAtSpeed2d, received, eventAfter, animationFrameEvts, loadAudioAsArray, expFollow, integral, sampleUpon } = require('riv-demo-lib');
const { renderDOMIntoSelector, h } = require('riv-snabbdom');
const amen_break_url = require('./amen_break.mp3');

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
      const count = countEvents(mouseClickEvts());
      const clock = () => countEvents(everySecond());
      const nums = streamMap(clock, Array(count));
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
      const cpos = useReducer(clickEvts, prevState => midpoint(prevState, mpos), {x: 0, y: 0});
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
        const [value, inputCallback] = useCallbackReducer((previousValue, e) => e.target.value, initialValue);

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

  {
    name: 'sum of a dynamic list of sliders',
    main: () => {
      const slider = () => {
        const [value, inputCallback] = useCallbackReducer((prevState, e) => +e.target.value, 0);
        const vnode = h('div', [
          h('input', {attrs: {type: 'range', min: 0, max: 10, value}, on: {input: inputCallback}}),
        ]);
        return [vnode, value];
      };

      const [count, [incCallback, decCallback]] = useCallbackReducers([
        n => n+1,
        n => (n > 0) ? n-1 : n,
      ], 5);

      const sliders = streamMap(slider, Array(count));
      const total = sliders.map(s => s[1]).reduce((a,b) => a + b, 0);
      const uiNode = h('div', [
        h('div', sliders.map(s => s[0])),
        h('div', 'Total: ' + total),
        h('div', [
          h('button', {on: {click: incCallback}}, 'Add Slider'),
          h('button', {on: {click: decCallback}}, 'Remove Slider'),
        ]),
      ]);

      renderDOMIntoSelector(uiNode, '#output');
    }
  }
]
