import { SignatureNode, NodeKind } from './Tree';
import { useCallbackReducer } from 'riv-runtime';
const { showString, animationTime, mouseDown, changeCount, streamMap, audioDriver, random, mouseClickEvts, redCircle, mousePosition, latestValue } = require('riv-demo-lib');
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

function simpleSig(ptypes: Array<string>, yields: boolean): SignatureNode {
  return {
    kind: NodeKind.Signature,
    streamParams: ptypes.map(pn => ({kind: NodeKind.SignatureStreamParameter})),
    funcParams: [],
    yields: yields ? [{kind: NodeKind.SignatureYield}] : [],
  }
}

const nativeFunctions: Array<[string, string, SignatureNode, Function]> = [
  // simple
  ['bind', '$o0 = $s0', simpleSig([''], true), (v: any) => v],
  ['ifte', 'if $s0 | then $s1 | else $s2', simpleSig(['_cond', 'then', 'else'], true), (cond: any, _then: any, _else: any) => (cond ? _then : _else)],

  // events
  ['changeCount', '', simpleSig(['_stream'], true), changeCount],
  ['latestValue', '', simpleSig(['event stream', 'initial value'], true), latestValue],

  // math
  ['add', '$s0 + $s1', simpleSig(['', ''], true), (a: number, b: number) => a + b],
  ['sub', '$s0 - $s1', simpleSig(['', ''], true), (a: number, b: number) => a - b],
  ['mult', '$s0 * $s1', simpleSig(['', ''], true), (a: number, b: number) => a * b],
  ['div', '$s0 / $s1', simpleSig(['', ''], true), (a: number, b: number) => a / b],
  ['cos', 'cosine of $s0 radians', simpleSig([''], true), Math.cos],
  ['sqr', '$s0 squared', simpleSig([''], true), (v: number) => v*v],

  // dom/browser
  ['showString', 'show value $s0', simpleSig([''], false), showString],
  ['animationTime', 'animation time', simpleSig([], true), animationTime],
  ['mouseDown', 'mouse button is down', simpleSig([], true), mouseDown],
  ['mousePosition', 'mouse position', simpleSig([], true), mousePosition],
  ['mouseClickEvts', 'mouse clicks', simpleSig([], true), mouseClickEvts],
  ['redCircle', 'draw red circle at $s0 radius $s1', simpleSig(['position', 'radius'], false), redCircle],
  ['random', 'random from 0 to 1, | repick on $s0', simpleSig(['repick'], true), random],

  // vec2
  ['vec2zero', 'zero 2d vector', simpleSig([], true), () => ({x: 0, y: 0})],
  ['vec2add', 'add 2d vectors $s0 and $s1', simpleSig(['', ''], true), (a: Vec2d, b: Vec2d) => ({x: a.x+b.x, y: a.y+b.y})],
  ['vec2sub', 'subtract 2d vectors $s0 and $s1', simpleSig(['', ''], true), (a: Vec2d, b: Vec2d) => ({x: a.x-b.x, y: a.y-b.y})],
  ['vec2len', 'length of 2d vector $s0', simpleSig([''], true), vec2dlen],
  ['vec2sqgrid', 'square grid of 2d vectors, $s0 per side, $s1 long', simpleSig(['', ''], true), vec2sqgrid],

  // misc
  ['text2num', 'text $s0 as a number', simpleSig([''], true), (text: string) => Number(text)],

  // snabbdom
  ['snabbdom.renderDOMIntoSelector', 'render HTML $s0 into selector $s1', simpleSig(['', ''], false), renderDOMIntoSelector],
  ['snabbdom.span', '<span> $s0 </span>', simpleSig([''], true), (text: string) => h('span', {}, text)],
  ['snabbdom.div', '<div> $s0 </div>', simpleSig([''], true), (children: ReadonlyArray<any>) => h('div', {}, children)],
  ['snabbdom.input', '<input text→ $o1 prefill= $s0 />', {
    kind: NodeKind.Signature,
    streamParams: [
      {
        kind: NodeKind.SignatureStreamParameter,
      },
    ],
    funcParams: [],
    yields: [
      {
        kind: NodeKind.SignatureYield,
      },
      {
        kind: NodeKind.SignatureYield,
      },
    ],
  }, (prefill: string): any => {
    const safePrefill = (typeof prefill === 'string') ? prefill : '';
    const [text, inputHandler] = useCallbackReducer<string, any>((_, e) => {
      const newText = e.target.value;
      return newText;
    }, safePrefill);
    return [
      h('input', {on: {input: inputHandler}, attrs: {value: text}}), // elem
      text // text
    ];
  }],

  // higher-order
  ['streamMap', 'map over $s0 with $f0', {
    kind: NodeKind.Signature,
    streamParams: [
      {
        kind: NodeKind.SignatureStreamParameter,
      },
    ],
    funcParams: [
      {
        kind: NodeKind.SignatureFunctionParameter,
        sig: {
          kind: NodeKind.Signature,
          streamParams: [
            {
              kind: NodeKind.SignatureStreamParameter,
            }
          ],
          funcParams: [],
          yields: [
            {
              kind: NodeKind.SignatureYield,
            }
          ],
        },
        templateNames: {
          streamParams: ['elem'],
          funcParams: [],
          yields: ['new elem'],
        },
      },
    ],
    yields: [
      {
        kind: NodeKind.SignatureYield,
      },
    ],
  }, (arr: Array<any>, f: (v: any) => any) => streamMap(f, arr)],

  ['audioDriver', 'play audio, computing each sample as $f0', {
    kind: NodeKind.Signature,
    streamParams: [],
    funcParams: [
      {
        kind: NodeKind.SignatureFunctionParameter,
        sig: {
          kind: NodeKind.Signature,
          streamParams: [
            {
              kind: NodeKind.SignatureStreamParameter,
            },
            {
              kind: NodeKind.SignatureStreamParameter,
            },
            {
              kind: NodeKind.SignatureStreamParameter,
            },
          ],
          funcParams: [],
          yields: [
            {
              kind: NodeKind.SignatureYield,
            }
          ],
        },
        templateNames: {
          streamParams: ['audio time', 'next frame', 'sample rate'],
          funcParams: [],
          yields: ['sample'],
        },
      },
    ],
    yields: [],
  }, audioDriver],
];

export default nativeFunctions;
