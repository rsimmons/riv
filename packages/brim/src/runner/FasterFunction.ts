import { ExecutionContext, useVar, useInitialize, useRequestUpdate } from 'riv-runtime';
import { CompiledDefinition, AppSpec } from '../compiler/CompiledDefinition';
import { UID } from '../compiler/Tree';
import Environment from '../util/Environment';

const INDENT = '  ';

// transform an id into a compiled JS variable name
function xid(n: string): string {
  return 'v$' + n;
}

function xargid(a: string | ReadonlyArray<string>): string {
  if (typeof(a) !== 'string') {
    throw new Error('not yet implemented');
  }
  return xid(a);
}

function indentCode(code: string): string {
  return code.split('\n').map(line => line.trim() ? INDENT + line : line).join('\n');
}

function codegenFunc(def: CompiledDefinition, live: boolean, index: number | undefined): string {
  const INIT_LIVE_DATA = `{acts: new Set()}`;
  const PUSH_HOOK_INDEX = `${INDENT}if (firstUpdate) achi.push(getCurrentHookIndex());\n`;
  const pieces: Array<string> = [];

  const live_data_vn = `live_${def.fid}`;

  if (live) {
    if (index === undefined) {
      pieces.push(
`const ${live_data_vn} = ${INIT_LIVE_DATA};
globalFuncs.push(${live_data_vn});
`
      );
    } else {
      pieces.push(
`if (firstUpdate) acf.push(INIT_LIVE_DATA);
const ${live_data_vn} = acf[${index}];
`
      )
    }
  }

  pieces.push(`const ${xid(def.fid)} = (${def.pids.map(xid).join(', ')}) => {\n`);
  if (live) {
    pieces.push(
`${INDENT}const firstUpdate = isFirstUpdate();
${INDENT}const activation = useVar(() => ({hookIdx: [], funcs: []}));
${INDENT}const ac = activation.current, achi = ac.hookIdx, acf = ac.funcs;
${INDENT}useInitialize(() => {
${INDENT}${INDENT}${live_data_vn}.acts.add(ac);
${INDENT}${INDENT}return () => {
${INDENT}${INDENT}${INDENT}${live_data_vn}.acts.delete(ac);
${INDENT}${INDENT}};
${INDENT}});\n\n`
    );
  }

  def.defs.map((subdef, idx) => {
    pieces.push(indentCode(codegenFunc(subdef, live, idx)));
  });

  for (const cdef of def.consts) {
    pieces.push(`${INDENT}const ${xid(cdef.sid)} = ${cdef.val === undefined ? 'undefined' : JSON.stringify(cdef.val)};\n`);
  }

  for (const app of def.apps) {
    if (live) {
      pieces.push(PUSH_HOOK_INDEX);
    }
    pieces.push(`${INDENT}`);
    if (app.fid === '$copy') { // special case
      pieces.push(`const ${xid(app.aid)} = ${xargid(app.args[0])};\n`);
    } else {
      if (app.oid !== null) {
        pieces.push(`const ${xid(app.aid)} = `);
      }
      pieces.push(`${xid(app.fid)}(${app.args.map(xargid).join(', ')});\n`);
    }
  }
  if (live) {
    pieces.push(PUSH_HOOK_INDEX);
  }

  if (def.oid) {
    pieces.push(`\n${INDENT}return ${xid(def.oid)};\n`);
  }

  pieces.push(`};\n`);

  return pieces.join('');
}

export function codegenRoot(initialDefinition: CompiledDefinition, live: boolean): Function {
  const pieces: Array<string> = [];

  for (const outerId of initialDefinition.orefs) {
    pieces.push(
`if (!globalEnv.has(${JSON.stringify(outerId)})) throw new Error();
const ${xid(outerId)} = globalEnv.get(${JSON.stringify(outerId)});
`
    );
  }

  if (live) {
    pieces.push(
`
const globalFuncs = [];
`
    );
  }

  pieces.push('\n');
  pieces.push(codegenFunc(initialDefinition, live, undefined));

  if (live) {
    pieces.push(`return {main: ${xid(initialDefinition.fid)}, globalFuncs};`);
  } else {
    pieces.push(`return {main: ${xid(initialDefinition.fid)}};`);
  }

  const createMainBody = pieces.join('');

  console.log(createMainBody);
  const createMain = new Function('globalEnv', createMainBody);

  return createMain;
}
