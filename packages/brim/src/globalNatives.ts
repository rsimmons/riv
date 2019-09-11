import { FunctionSignature } from './State';
const { showString, animationTime, mouseDown, changeCount, streamMap, audioDriver, random, mouseClickEvts, redCircle, mousePosition, latestValue } = require('riv-demo-lib');

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

const nativeFunctions: Array<[string, string, Array<string>, Array<[string, FunctionSignature]>, Function]> = [
  ['add', 'add', ['_a', '_b'], [], (a: number, b: number) => a + b],
  ['sub', 'subtract', ['_a', '_b'], [], (a: number, b: number) => a - b],
  ['mult', 'multiply', ['_a', '_b'], [], (a: number, b: number) => a * b],
  ['div', 'divide', ['_a', '_b'], [], (a: number, b: number) => a / b],
  ['showString', 'show value', ['_v'], [], showString],
  ['animationTime', 'animation time', [], [], animationTime],
  ['mouseDown', 'is mouse down', [], [], mouseDown],
  ['changeCount', 'change count', ['_stream'], [], changeCount],
  ['streamMap', 'map', ['_array'], [['_func', {parameters: ['value'], functionParameters: []}]], (arr: Array<any>, f: (v: any) => any) => streamMap(f, arr)],
  ['ifte', 'if', ['cond', 'then', 'else'], [], (cond: any, _then: any, _else: any) => (cond ? _then : _else)],
  ['audioDriver', 'play computed audio', [], [['_func', {parameters: ['audio time', 'next frame', 'sample rate'], functionParameters: []}]], audioDriver],
  ['cos', 'cosine', ['_v'], [], Math.cos],
  ['random', 'random', ['repick'], [], random],
  ['mouseClickEvts', 'mouse click', [], [], mouseClickEvts],
  ['redCircle', 'draw red circle', ['position', 'radius'], [], redCircle],
  ['mousePosition', 'mouse position', [], [], mousePosition],
  ['latestValue', 'latest event value', ['event stream', 'initial value'], [], latestValue],
  ['vec2zero', 'zero 2d vector', [], [], () => ({x: 0, y: 0})],
  ['vec2add', 'add 2d vectors', ['_a', '_b'], [], (a: Vec2d, b: Vec2d) => ({x: a.x+b.x, y: a.y+b.y})],
  ['vec2sub', 'subtract 2d vectors', ['_a', '_b'], [], (a: Vec2d, b: Vec2d) => ({x: a.x-b.x, y: a.y-b.y})],
  ['vec2len', 'length of 2d vector', ['_v'], [], vec2dlen],
  ['vec2sqgrid', 'square grid of 2d vectors', ['count', 'size'], [], vec2sqgrid],
];

export default nativeFunctions;
