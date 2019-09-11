import { FunctionSignature } from './State';
const { showString, animationTime, mouseDown, changeCount, streamMap, audioDriver, random, mouseClickEvts } = require('riv-demo-lib');

const nativeFunctions: Array<[string, string, Array<string>, Array<[string, FunctionSignature]>, Function]> = [
  ['add', 'add', ['_a', '_b'], [], (a: number, b: number) => a + b],
  ['mult', 'multiply', ['_a', '_b'], [], (a: number, b: number) => a * b],
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
];

export default nativeFunctions;
