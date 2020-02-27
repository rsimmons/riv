import { useCallbackReducer } from 'riv-runtime';
const { showString, animationTime, mouseDown, changeCount, streamMap, audioDriver, random, mouseClickEvts, redCircle, mousePosition } = require('riv-demo-lib');
const { h, renderDOMIntoSelector } = require('riv-snabbdom');

interface Vec2d {
  x: number;
  y: number;
}

function vec2dlen(v: Vec2d) {
  return Math.sqrt(v.x*v.x + v.y*v.y);
}

function vec2sqgrid(count: number, size: number) {
  const spacing = size / count;
  const vecs: Array<Vec2d> = [];
  for (let y = 0; y < count; y++) {
    for (let x = 0; x < count; x++) {
      vecs.push({
        x: x*spacing,
        y: y*spacing,
      });
    }
  }

  return vecs;
}

const nativeFunctions: Array<[string, string, Function]> = [
  // simple
  ['bind', '{y0} = {0} => void', (v: any) => v],
  ['ifte', 'if {0} | then {1} | otherwise {2} => {}', (cond: any, _then: any, _else: any) => (cond ? _then : _else)],
  ['equals', '{0} equals {1} => {}', (a: any, b: any) => Object.is(a, b)],

  // events
  ['changeCount', 'number of times {0} has changed => {}', changeCount],

  // math
  ['add', '{0} + {1} => {}', (a: number, b: number) => a + b],
  ['sub', '{0} - {1} => {}', (a: number, b: number) => a - b],
  ['mult', '{0} * {1} => {}', (a: number, b: number) => a * b],
  ['div', '{0} / {1} => {}', (a: number, b: number) => a / b],
  ['cos', 'cosine of {0} radians => {}', Math.cos],
  ['sqr', '{0} squared => {}', (v: number) => v*v],

  // dom/browser
  ['showString', 'show the value {0} => void', showString],
  ['animationTime', 'animation time => {}', animationTime],
  ['mouseDown', 'mouse button is down => {}', mouseDown],
  ['mousePosition', 'mouse position => {}', mousePosition],
  ['mouseClickEvts', 'mouse clicks => {}', mouseClickEvts],
  ['redCircle', 'draw red circle at {0:position} with radius {1:radius} => void', redCircle],
  ['random', 'random from 0 to 1, | repick on {0} => {}', random],

  // vec2
  ['vec2zero', 'zero 2d vector => {}', () => ({x: 0, y: 0})],
  ['vec2add', 'add 2d vectors {0} and {1} => {}', (a: Vec2d, b: Vec2d) => ({x: a.x+b.x, y: a.y+b.y})],
  ['vec2sub', 'subtract 2d vectors {0} and {1} => {}', (a: Vec2d, b: Vec2d) => ({x: a.x-b.x, y: a.y-b.y})],
  ['vec2len', 'length of 2d vector {0} => {}', vec2dlen],
  ['vec2sqgrid', 'square grid of 2d vectors, {0} per side, {1} long => {}', vec2sqgrid],

  // misc
  ['text2num', 'text {0:text} as a number => {:number}', (text: string) => Number(text)],

  // snabbdom
  ['snabbdom.renderDOMIntoSelector', 'render HTML {0} | into selector {1} => void', renderDOMIntoSelector],
  ['snabbdom.span', '<span> {0} </span> => {}', (text: string) => h('span', {}, text)],
  ['snabbdom.div', '<div> {0} </div> => {}', (children: ReadonlyArray<any>) => h('div', {}, children)],
  ['snabbdom.input', '<input | text→ {y1} | prefill= {0} | /> => {}',
    (prefill: string): any => {
      const safePrefill = (typeof prefill === 'string') ? prefill : '';
      const [text, inputHandler] = useCallbackReducer<string, any>((_, e) => {
        const newText = e.target.value;
        return newText;
      }, safePrefill);
      return [
        h('input', {on: {input: inputHandler}, attrs: {value: text}}), // elem
        text // text
      ];
    }
  ],

  // higher-order
  ['streamMap', 'map over {0} with {f0::transform {0:element} => {:new element}} => {}',
    (arr: Array<any>, f: (v: any) => any) => streamMap(f, arr)],

  ['audioDriver', 'play audio with {f0::{0:audio time} {1:next sample} {2:sample rate} => {y0:sample}} => void', audioDriver],
];

export default nativeFunctions;
