import { useCallbackReducer } from 'riv-runtime';
import { NodeKind, NativeFunctionDefinitionNode, ApplicationSettings } from './Tree';
import { TreeSignatureStreamParam, DynamicTextualFunctionInterfaceActionHandlerResult } from './FunctionInterface';
import { TemplateGroup } from './TemplateLayout';
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

const strtextNativeFunctions: Array<[string, string, Function]> = [
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
  ['jsonStringify', 'JSON serialize {0:value} => {:JSON}', (value: any) => JSON.stringify(value)],

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

const globalNativeFunctions: Array<NativeFunctionDefinitionNode> = [];

strtextNativeFunctions.forEach(([fid, ifaceSpecStr, jsImpl]) => {
  globalNativeFunctions.push({
    kind: NodeKind.NativeFunctionDefinition,
    fid,
    iface: {
      kind: 'strtext',
      spec: ifaceSpecStr,
    },
    impl: jsImpl,
  });
});

globalNativeFunctions.push(
  {
    kind: NodeKind.NativeFunctionDefinition,
    fid: 'array',
    iface: {
      kind: 'dtext',
      getIface: (settings) => {
        if ((settings !== undefined) && (typeof settings !== 'number')) {
          throw new Error();
        }
        const size: number = (settings === undefined) ? 1 : settings;

        const streamParams: Array<TreeSignatureStreamParam> = [];
        const tmpl: Array<TemplateGroup> = [];

        tmpl.push({segments: [{kind: 'text', text: '['}]});
        for (let i = 0; i < size; i++) {
          streamParams.push({name: undefined});
          tmpl.push({
            segments: [{kind: 'placeholder', key: 's' + i}],
            editable: {
              insertBefore: true,
              insertAfter: true,
              delete: true,
            },
          });
        }
        tmpl.push({segments: [{kind: 'text', text: ']'}]});

        return {
          treeSig: {
            streamParams,
            funcParams: [],
            yields: [{name: undefined}],
            returnedIdx: 0,
          },
          tmpl,
        };
      },
      onEdit: (action, groupId, settings): DynamicTextualFunctionInterfaceActionHandlerResult => {
        console.log('array onEdit', action, groupId, settings);
        if ((settings !== undefined) && (typeof settings !== 'number')) {
          throw new Error();
        }
        const size: number = (settings === undefined) ? 1 : settings;

        const insertAt = (idx: number): DynamicTextualFunctionInterfaceActionHandlerResult => {
          const streamParams: Array<number | undefined> = [];
          for (let i = 0; i < idx; i++) {
            streamParams.push(i);
          }
          streamParams.push(undefined);
          for (let i = idx; i < size; i++) {
            streamParams.push(i);
          }
          return {
            newSettings: size+1,
            remap: {
              streamParams,
              funcParams: [],
              yields: [],
            },
            newSelectedKey: 's' + idx,
          }
        };

        const editIdx = groupId - 1;
        switch (action) {
          case 'insert-before':
            return insertAt(editIdx);

          case 'insert-after':
            return insertAt(editIdx+1);

          case 'delete':
            if (size < 1) {
              throw new Error();
            }
            const streamParams: Array<number> = [];
            for (let i = 0; i < editIdx; i++) {
              streamParams.push(i);
            }
            for (let i = editIdx+1; i < size; i++) {
              streamParams.push(i);
            }
            return {
              newSettings: size-1,
              remap: {
                streamParams,
                funcParams: [],
                yields: [],
              },
              newSelectedKey: (size === 1) ? undefined : ((editIdx === (size - 1)) ? ('s' + (size - 2)) : ('s' + editIdx)),
            };
        }
        throw new Error();
      },
    },
    impl: (settings: ApplicationSettings, streamArgs: ReadonlyArray<any>) => {
      if ((settings !== undefined) && (typeof settings !== 'number')) {
        throw new Error();
      }
      const size: number = (settings === undefined) ? 1 : settings;
      if (streamArgs.length !== size) {
        throw new Error();
      }
      return [[...streamArgs]]; // I'm pretty sure we don't need to clone the input array, but just to be safe
    },
  },
);

export default globalNativeFunctions;
