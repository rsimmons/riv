import { useCallbackReducer, ExecutionContext, useEventEmitter, useVar, useEventReceiver, useRequestUpdate, useDynamic, useInitialize, useReducer } from 'riv-runtime';
import { NodeKind, FunctionInterfaceNode, FunctionDefinitionNode, ParamNode } from '../compiler/Tree';
import genuid from '../util/uid';

const { showString, animationTime, mouseDown, changeCount, streamMap, audioDriver, random, mouseClickEvts, drawCircle, mousePosition } = require('riv-demo-lib');

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

export function robustIntegral(time: number | undefined, initialValue: number | undefined, integrandFunc: (v: number, t: number) => number | undefined) {
  const isValidNumber = (v: any): v is number => (typeof v === 'number') && !Number.isNaN(v);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const accum = useVar(initialValue);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const prevTime = useVar(time);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const createIntegrandFuncCtx = useDynamic(integrandFunc);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const integrandFuncCtx = useVar(() => createIntegrandFuncCtx());

  if ((accum.current !== undefined) && isValidNumber(prevTime.current) && isValidNumber(time) && (time > prevTime.current)) {
    const integrand = integrandFuncCtx.current.update(accum.current, prevTime.current);
    if (isValidNumber(integrand)) {
      accum.current += (time - prevTime.current)*integrand;
    }
  }

  prevTime.current = time;

  return accum.current;
}

function serializeAsyncToStreamFunc<A, R>(argStream: A, worker: (arg: A) => Promise<R>, def: R): R {
  // console.log('serializeAsyncToStreamFunc entered');
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const requestUpdate = useRequestUpdate();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const active = useVar(true); // not yet shut down
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const currentResult = useVar(def);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const currentResultForArgValue = useVar<A|undefined>(undefined);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const lastReceivedArgValue = useVar(argStream);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const working = useVar(false);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useInitialize(() => {
    return () => {
      active.current = false;
    };
  });

  const startWork = (arg: A): void => {
    working.current = true;
    worker(arg).then(result => {
      currentResult.current = result;
    }).catch(() => {
      currentResult.current = def;
    }).finally(() => {
      working.current = false;
      currentResultForArgValue.current = arg;
      if (active.current) {
        requestUpdate();
      }
      maybeStartWork(); // should we do this with setTimeout 0?
    });
  };

  lastReceivedArgValue.current = argStream;

  const maybeStartWork = () => {
    if (!working.current && !Object.is(lastReceivedArgValue.current, currentResultForArgValue.current)) {
      startWork(lastReceivedArgValue.current);
    }
  };

  maybeStartWork();

  return currentResult.current;
}

interface ArrayLike {
  readonly length: number;
  [index: number]: number;
}

function decodeAudioFileToArray(fileData: any) {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const audioCtx = useVar(() => new window.AudioContext());

  const worker = async (fd: any) => {
    const audioBuffer = await (audioCtx.current as AudioContext).decodeAudioData(fd);
    const sampleArr = audioBuffer.getChannelData(0);
    return sampleArr;
  };

  return serializeAsyncToStreamFunc<any, ArrayLike>(fileData, worker, [0]);
}

type AbbrevFunctionParam = [/*name*/ string, /*type*/ string | AbbrevFunctionInterface]
type AbbrevFunctionInterface = [/*name*/ string, /*params*/ ReadonlyArray<AbbrevFunctionParam>, /*return*/ string, /*tmpl*/ string];

const strtextNativeFunctions: ReadonlyArray<[string, AbbrevFunctionInterface, Function]> = [
  // simple
  ['ifte', ['ifte', [['cond', 'boolean'], ['then', 'A'], ['else', 'A']], 'A', 'if $0|then $1|else $2'], (cond: any, _then: any, _else: any) => (cond ? _then : _else)],
  ['equals', ['equals', [['', 'A'], ['', 'A']], 'boolean', '$0|equals|$1'], (a: any, b: any) => Object.is(a, b)],

/*
  // events
  ['changeCount', 'number of times {0} has changed => {}', changeCount],
*/

  // math
  ['add', ['add', [['a', 'number'], ['b', 'number']], 'number', '$0|+|$1'], (a: number, b: number) => a + b],
  ['sub', ['sub', [['a', 'number'], ['b', 'number']], 'number', '$0|-|$1'], (a: number, b: number) => a - b],
  ['mul', ['mul', [['a', 'number'], ['b', 'number']], 'number', '$0|*|$1'], (a: number, b: number) => a * b],
  ['exp', ['exp', [['x', 'number']], 'number', 'exp $0'], (v: number) => Math.exp(v)],
/*
  ['mul', '{0::number} * {1::number} => {::number}', (a: number, b: number) => a * b],
  ['div', '{0::number} / {1::number} => {::number}', (a: number, b: number) => a / b],
  ['sqr', '{0::number} squared => {::number}', (v: number) => v*v],
*/
  ['cos', ['cosine', [['radians', 'number']], 'number', 'cosine of $0 radians'], Math.cos],

  // dom/browser
  ['showString', ['show', [['value', 'A']], 'void', ''], showString],
  ['animationTime', ['animation time', [], 'number', ''], animationTime],
  ['random', ['random from 0 to 1', [['repick', 'event<T>']], 'number', ''], random],
  ['mouseDown', ['mouse button is down', [], 'boolean', ''], mouseDown],
  ['mouseClick', ['mouse clicks', [], 'event<nothing>', ''], mouseClickEvts],
  ['mousePosition', ['mouse position', [], 'vec2', ''], mousePosition],
  ['drawCircle', ['draw circle', [['position', 'vec2'], ['radius', 'number'], ['color', 'string']], 'nothing', ''], drawCircle],

/*

  // vec2
  ['vec2zero', 'zero 2d vector => {}', () => ({x: 0, y: 0})],
  ['vec2add', 'add 2d vectors {0} and {1} => {}', (a: Vec2d, b: Vec2d) => ({x: a.x+b.x, y: a.y+b.y})],
  ['vec2sub', 'subtract 2d vectors {0} and {1} => {}', (a: Vec2d, b: Vec2d) => ({x: a.x-b.x, y: a.y-b.y})],
  ['vec2len', 'length of 2d vector {0} => {}', vec2dlen],
  ['vec2sqgrid', 'square grid of 2d vectors, {0} per side, {1} long => {}', vec2sqgrid],

  // misc
  ['text2num', 'text {0:text:text} as a number => {:number:number}', (text: string) => Number(text)],
  ['jsonStringify', 'JSON serialize {0:value} => {:JSON}', (value: any) => JSON.stringify(value)],
  ['decodeAudio', 'decode audio file {0:file data:step<bytes>} to array => {::step<list<number>>}', decodeAudioFileToArray],
  ['arrayElemWrap', 'element at index {0::number} of array {1::list<A>} (with wraparound) => {::A}', (idx: any, arr: any): any => {
    if ((typeof idx !== 'number') || !arr || (typeof arr.length !== 'number') || (arr.length === 0)) {
      return undefined;
    }

    const wrapIdx = ((Math.floor(idx) % arr.length) + arr.length) % arr.length;
    const elem = arr[wrapIdx];
    return elem;
  }],

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
  ['snabbdom.button', '<button | text= {0} | clicks→ {y1} | /> => {}',
    (text: string): any => {
      const requestUpdate = useRequestUpdate();
      const [clickEvts, emitClick] = useEventEmitter();
      const handleClick = (e: any) => {
        emitClick(e);
        requestUpdate();
      };
      return [
        h('button', {on: {click: handleClick}}, text), // elem
        clickEvts
      ];
    }
  ],
*/

  // higher-order
  ['reduce', ['reduce', [
    ['init', 'S'],
    ['events', 'event<A>'],
    ['', ['compute new val', [
      ['old', 'S'],
      ['event', 'A'],
    ], 'step<S>', '']],
  ], 'S', 'set|initially to $0|then when $1|$2'], (ival: any, evts: any, reducer: any) => {
     const state = useVar(ival);
     const evt = useEventReceiver(evts);
     if (evt) {
       // NOTE: we have to use runForOneInstant to create a sub-ExecutionContext for reducer
       state.current = runForOneInstant(reducer, [state.current, evt.value]);
     }
     return state.current;
  }],

  ['audioDriver', ['play generated audio', [
    ['', ['compute sample', [
      ['audio time', 'step<number>'],
      ['next sample', 'event<nothing>'],
      ['sample rate', 'step<number>'],
    ], 'step<number>', '']],
  ], 'void', ''], audioDriver],
/*
  ['streamMap', 'map over {0::list<A>} with {f0::transform {0:element:A} => {:new element:B}} => {::list<B>}',
    (arr: Array<any>, f: (v: any) => any) => streamMap(f, arr)],

  ['integrate', 'integrate | {f0::derivative at value {0:value:step<number>} time {1:time:step<number>} => {:derivative:step<number>}} | over time {0:time:number} | from initial value {1:initial value:number} => {::number}', robustIntegral],
*/
];

const globalNativeFunctions: Array<FunctionDefinitionNode> = [];

// NOTE: We ensure that parameter-ids are stable, so that we can save/load code that uses builtins
function expandInterface(abbrevIface: AbbrevFunctionInterface, idPrefix: string): FunctionInterfaceNode {
  const [name, abbrevParams, ret, tmpl] = abbrevIface;

  return {
    kind: NodeKind.FunctionInterface,
    nid: genuid(),
    name: {kind: NodeKind.Text, nid: genuid(), text: name},
    params: abbrevParams.map(([pname, ptype], idx) => {
      const pid = idPrefix + idx;
      const paramNode: ParamNode = {
        kind: NodeKind.Param,
        nid: pid,
        name: {kind: NodeKind.Text, nid: genuid(), text: pname},
        type: (typeof(ptype) === 'string') ? null : expandInterface(ptype, pid + '-'),
      };
      return paramNode;
    }),
    output: (ret === 'void') ? {kind: NodeKind.Void, nid: genuid()} : {kind: NodeKind.AnyType, nid: genuid()},
    template: tmpl ? tmpl : undefined,
  };
}

strtextNativeFunctions.forEach(([fid, abbrevIface, jsImpl]) => {
  globalNativeFunctions.push({
    kind: NodeKind.FunctionDefinition,
    nid: fid,
    iface: expandInterface(abbrevIface, fid + '-'),
    impl: {
      kind: NodeKind.NativeImpl,
      nid: genuid(),
      impl: jsImpl,
    },
  });
});

function runForOneInstant(streamFunc: Function, args: Array<any>): any {
  const ctx = new ExecutionContext(streamFunc, () => {});
  const retval = ctx.update(...args);
  ctx.terminate();
  return retval;
}

/*
globalNativeFunctions.push(
  {
    kind: NodeKind.NativeFunctionDefinition,
    fid: 'array',
    iface: {
      kind: NodeKind.DynamicFunctionInterface,
      getIface: (settings) => {
        if ((settings !== undefined) && (typeof settings !== 'number')) {
          throw new Error();
        }
        const size: number = (settings === undefined) ? 1 : settings;

        const tmpl: Array<TemplateGroup> = [];

        tmpl.push({segments: [{kind: 'text', text: '['}]});
        for (let i = 0; i < size; i++) {
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
          streamParams: [...Array(size)].map(() => ({
            name: undefined,
          })),
          funcParams: [],
          outs: [{
            name: undefined,
          }],
          tmpl,
          returnedIdx: 0,
        };
      },
      onEdit: (action, groupId, settings): DynamicInterfaceChange => {
        if ((settings !== undefined) && (typeof settings !== 'number')) {
          throw new Error();
        }
        const size: number = (settings === undefined) ? 1 : settings;

        const insertAt = (idx: number): DynamicInterfaceChange => {
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
              newSelectedKey: (size === 1) ? 'parent' : ((editIdx === (size - 1)) ? ('s' + (size - 2)) : ('s' + editIdx)),
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

  {
    kind: NodeKind.NativeFunctionDefinition,
    fid: 'multireducer',
    iface: {
      kind: NodeKind.DynamicFunctionInterface,
      getIface: (settings) => {
        if ((settings !== undefined) && (typeof settings !== 'number')) {
          throw new Error();
        }
        const size: number = (settings === undefined) ? 1 : settings;

        const streamParams: Array<StreamParam> = [];
        const funcParams: Array<FunctionParam> = [];
        const tmpl: Array<TemplateGroup> = [];

        tmpl.push({segments: [{kind: 'text', text: 'set'}]});
        tmpl.push({segments: [{kind: 'text', text: 'initially'}, {kind: 'placeholder', key: 'f0'}]});
        funcParams.push({iface: {
          streamParams: [],
          funcParams: [],
          outs: [{name: 'value'}],
          returnedIdx: 0,
          tmpl: [{segments: [{kind: 'text', text: 'initialize'}]}],
        }});
        for (let i = 0; i < size; i++) {
          tmpl.push({
            segments: [
              {kind: 'text', text: 'on'},
              {kind: 'placeholder', key: 's' + i},
              {kind: 'text', text: 'then'},
              {kind: 'placeholder', key: 'f' + (i+1)},
            ],
            editable: {
              insertBefore: true,
              insertAfter: true,
              delete: true,
            },
          });

          streamParams.push({name: undefined});
          funcParams.push({iface: {
            streamParams: [
              {name: 'previous value'},
              {name: 'event'},
            ],
            funcParams: [],
            outs: [{name: 'new value'}],
            returnedIdx: 0,
            tmpl: [{segments: [{kind: 'placeholder', key: 's0'}, {kind: 'placeholder', key: 's1'}]}],
          }});
        }

        return {
          streamParams,
          funcParams,
          outs: [{name: undefined}],
          returnedIdx: 0,
          tmpl,
        };
      },
      onEdit: (action, groupId, settings): DynamicInterfaceChange => {
        if ((settings !== undefined) && (typeof settings !== 'number')) {
          throw new Error();
        }
        const size: number = (settings === undefined) ? 1 : settings;

        const insertAt = (idx: number): DynamicInterfaceChange => {
          const streamParams: Array<number | undefined> = [];
          const funcParams: Array<number | undefined> = [0];
          for (let i = 0; i < idx; i++) {
            streamParams.push(i);
            funcParams.push(i+1);
          }
          streamParams.push(undefined);
          funcParams.push(undefined);
          for (let i = idx; i < size; i++) {
            streamParams.push(i);
            funcParams.push(i+1);
          }
          return {
            newSettings: size+1,
            remap: {
              streamParams,
              funcParams,
              yields: [],
            },
            newSelectedKey: 's' + idx,
          }
        };

        const editIdx = groupId - 2;
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
            const funcParams: Array<number> = [0];
            for (let i = 0; i < editIdx; i++) {
              streamParams.push(i);
              funcParams.push(i+1);
            }
            for (let i = editIdx+1; i < size; i++) {
              streamParams.push(i);
              funcParams.push(i+1);
            }
            return {
              newSettings: size-1,
              remap: {
                streamParams,
                funcParams,
                yields: [],
              },
              newSelectedKey: (size === 1) ? 'parent' : ((editIdx === (size - 1)) ? ('s' + (size - 2)) : ('s' + editIdx)),
            };
        }
        throw new Error();
      },
    },
    impl: (settings: ApplicationSettings, streamArgs: ReadonlyArray<any>, funcArgs: ReadonlyArray<Function>) => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const state = useVar();

      if ((settings !== undefined) && (typeof settings !== 'number')) {
        throw new Error();
      }
      const size: number = (settings === undefined) ? 1 : settings;
      if (streamArgs.length !== size) {
        throw new Error();
      }

      const definedStreamArgs: Array<[number, any]> = [];
      streamArgs.forEach((sa, sidx) => {
        if (sa && sa.subscribe) {
          definedStreamArgs.push([sidx, sa]);
        }
      });

      // eslint-disable-next-line react-hooks/rules-of-hooks
      const evs = useEventMultiReceiver(definedStreamArgs.map(([, sa]) => sa));

      let anyEvent = false;
      let idx = 0;
      for (const ev of evs) {
        if (ev) {
          anyEvent = true;
          const origSargIdx = definedStreamArgs[idx][0];
          const handlerResult = runForOneInstant(funcArgs[origSargIdx+1], [state.current, ev.value]);
          if (handlerResult !== undefined) {
            state.current = handlerResult;
          }
          break;
        }
        idx++;
      }
      if (!anyEvent && (state.current === undefined)) {
        state.current = runForOneInstant(funcArgs[0], []);
      }

      return [state.current];
    },
  },

  {
    kind: NodeKind.NativeFunctionDefinition,
    fid: 'slider',
    iface: {
      kind: NodeKind.DynamicFunctionInterface,
      getIface: () => {
        const tmpl: Array<TemplateGroup> = [];
        tmpl.push({segments: [{kind: 'text', text: 'slider'}]});

        return {
          streamParams: [],
          funcParams: [],
          outs: [{name: undefined}],
          returnedIdx: 0,
          tmpl,
        };
      },
      createCustomUI: (underNode, settings, onChange) => {
        console.log('SLIDER createCustomUI');
        if ((settings !== undefined) && (typeof settings !== 'number')) {
          throw new Error();
        }
        const value: number = (settings === undefined) ? 0 : settings;

        const sliderElem = document.createElement('input');
        sliderElem.type = 'range';
        sliderElem.value = value.toString();
        underNode.appendChild(sliderElem);

        sliderElem.addEventListener('input', e => {
          const newValue = Number((e.target as HTMLInputElement).value);
          console.log('SLIDER newValue', newValue);
          onChange({
            newSettings: Number((e.target as HTMLInputElement).value),
          });
        }, false);

        const shutdown = () => {};

        return shutdown;
      },
    },
    impl: (settings: ApplicationSettings) => {
      if ((settings !== undefined) && (typeof settings !== 'number')) {
        throw new Error();
      }
      const value: number = (settings === undefined) ? 0 : settings;

      return [value];
    },
  },

  {
    kind: NodeKind.NativeFunctionDefinition,
    fid: 'fileData',
    iface: {
      kind: NodeKind.DynamicFunctionInterface,
      getIface: () => {
        const tmpl: Array<TemplateGroup> = [];
        tmpl.push({segments: [{kind: 'text', text: 'file data'}]});

        return {
          streamParams: [],
          funcParams: [],
          outs: [{name: undefined}],
          returnedIdx: 0,
          tmpl,
        };
      },
      createCustomUI: (underNode, settings, onChange) => {
        if ((settings !== undefined) && (settings.constructor !== ArrayBuffer)) {
          throw new Error();
        }
        const value: ArrayBuffer = (settings === undefined) ? (new ArrayBuffer(0)) : settings;

        let active = true;

        const fileInputElem = document.createElement('input');
        fileInputElem.type = 'file';
        underNode.appendChild(fileInputElem);

        const statusText = document.createTextNode('');
        underNode.appendChild(statusText);

        fileInputElem.addEventListener('change', e => {
          const files = (e.target as HTMLInputElement).files;
          if (files && files.length > 0) {
            const reader = new FileReader();

            reader.onload = loadEvent => {
              if (active) {
                const result = loadEvent.target!.result;
                if (!result || (result.constructor !== ArrayBuffer)) {
                  throw new Error();
                }
                onChange({
                  newSettings: result,
                });
              }
            };

            reader.readAsArrayBuffer(files[0]);
          } else {
            onChange({
              newSettings: new ArrayBuffer(0),
            });
          }
        }, false);

        const shutdown = () => {
          active = false;
        };

        return shutdown;
      },
    },
    impl: (settings: ApplicationSettings) => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const defRet = useVar(() => new ArrayBuffer(0)); // save this so identity doesn't change
      if ((settings !== undefined) && (settings.constructor !== ArrayBuffer)) {
        throw new Error();
      }
      const value: ArrayBuffer = (settings === undefined) ? defRet.current : settings;

      return [value];
    },
  },
);
*/

export default globalNativeFunctions;
