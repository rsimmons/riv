import { TemplateSegment, TemplateGroup, TemplateLayout, templateToPlainText } from './TemplateLayout';
import { ApplicationSettings } from './Tree';
const pegParser = require('./parseStringTextualFunctionInterfaceSpec');

export interface TreeSignatureStreamParam {
  name: string | undefined;
  // eventually, type info will go here
}

export interface TreeSignatureFuncParam {
  name: string | undefined;
  readonly ifaceSpec: FunctionInterfaceSpec;
}

export interface TreeSignatureYield {
  name: string | undefined;
  // eventually, type info will go here
}

// This is the information we need to determine that a tree-application is valid,
// provide placeholder child nodes (with names), reconcile with a tree-implementation, etc.
// It does not include anything related to textual syntax templates or custom UI.
// This is NOT stored in saved code.
export interface TreeSignature {
  readonly streamParams: ReadonlyArray<TreeSignatureStreamParam>;
  readonly funcParams: ReadonlyArray<TreeSignatureFuncParam>;
  readonly yields: ReadonlyArray<TreeSignatureYield>;
  readonly returnedIdx: number | undefined;
}

// This is NOT stored in saved code. It is derived from a spec.
interface TextualFunctionInterface {
  treeSig: TreeSignature;
  tmpl: TemplateLayout;
}

// This IS stored in saved code.
interface StringTextualFunctionInterfaceSpec {
  kind: 'strtext';
  spec: string;
}

export type DynamicTextualFunctionInterfaceAction = 'insert-before' | 'insert-after' | 'delete';

export type DynamicTextualFunctionInterfaceActionHandlerResult = {
  readonly newSettings: ApplicationSettings;
  readonly remap: {
    // for each of these, the array is of indexes into the old params/yields
    streamParams: ReadonlyArray<number | undefined>;
    funcParams: ReadonlyArray<number | undefined>;
    yields: ReadonlyArray<number | undefined>;
  }
  readonly newSelectedKey: string | undefined;
}

// This IS stored in saved code. (or well, should be once we fix it)
interface DynamicTextualFunctionInterfaceSpec {
  kind: 'dtext';
  // TODO: these funcs should be in a JS code string, props on one object, so we can store them?
  getIface: (settings: ApplicationSettings) => TextualFunctionInterface;
  onEdit: (action: DynamicTextualFunctionInterfaceAction, groupId: number, settings: ApplicationSettings) => DynamicTextualFunctionInterfaceActionHandlerResult;
}

interface CustomFunctionInterfaceSpec {
  kind: 'custom';
  // TODO:
  // - JS func to construct UI, under given DOM node, and with given initial settings. also gets a callback to report settings changes. returns shutdown closure
  // - that also needs to report a TreeSignature somehow
}

export type FunctionInterfaceSpec = StringTextualFunctionInterfaceSpec | DynamicTextualFunctionInterfaceSpec;

export class InterfaceSpecParseError extends Error {
};

export function parseStringTextualInterfaceSpec(spec: string): TextualFunctionInterface {
  let parseResult;
  try {
    parseResult = pegParser.parse(spec);
  } catch (e) {
    throw new InterfaceSpecParseError(e.message);
  }

  const tmplGroups: Array<TemplateGroup> = [];
  let groupSegs: Array<TemplateSegment> = [];

  const streamParamFromIdx: Map<number, TreeSignatureStreamParam> = new Map();
  const funcParamFromIdx: Map<number, TreeSignatureFuncParam> = new Map();
  const yieldFromIdx: Map<number, TreeSignatureYield> = new Map();

  const emitGroup = () => {
    tmplGroups.push({
      segments: groupSegs,
    });
    groupSegs = [];
  };

  for (const seg of parseResult.tmplSegs) {
    switch (seg.segKind) {
      case 'text':
        groupSegs.push({
          kind: 'text',
          text: seg.text,
        });
        break;

      case 'placeholder':
        groupSegs.push({
          kind: 'placeholder',
          key: seg.info.pkind + seg.info.idx,
        });

        switch (seg.info.pkind) {
          case 's':
            streamParamFromIdx.set(seg.info.idx, {name: seg.info.name});
            break;

          case 'f':
            funcParamFromIdx.set(seg.info.idx, {
              name: seg.info.name,
              ifaceSpec: {
                kind: 'strtext',
                spec: seg.info.type.rawText,
              },
            });
            break;

          case 'y':
            yieldFromIdx.set(seg.info.idx, {name: seg.info.name});
            break;

          default:
            throw new Error();
        }
        break;

      case 'break':
        emitGroup();
        break;

      default:
        throw new Error();
    }
  }
  emitGroup();

  let returnedIdx: number | undefined;
  if (parseResult.ret) {
    if (parseResult.ret.pkind !== 'y') {
      throw new Error();
    }
    returnedIdx = parseResult.ret.idx;
    yieldFromIdx.set(parseResult.ret.idx, {name: parseResult.ret.name});
  }

  const streamParams: Array<TreeSignatureStreamParam> = [];
  let idx = 0;
  while (true) {
    const param = streamParamFromIdx.get(idx);
    if (param === undefined) {
      break;
    }
    streamParams.push(param);
    idx++;
  }
  if (streamParamFromIdx.size !== idx) {
    throw new Error('must be gap in indexes');
  }

  const funcParams: Array<TreeSignatureFuncParam> = [];
  idx = 0;
  while (true) {
    const param = funcParamFromIdx.get(idx);
    if (param === undefined) {
      break;
    }
    funcParams.push(param);
    idx++;
  }
  if (funcParamFromIdx.size !== idx) {
    throw new Error('must be gap in indexes');
  }

  const yields: Array<TreeSignatureYield> = [];
  idx = 0;
  while (true) {
    const param = yieldFromIdx.get(idx);
    if (param === undefined) {
      break;
    }
    yields.push(param);
    idx++;
  }
  if (yieldFromIdx.size !== idx) {
    throw new Error('must be gap in indexes');
  }

  return {
    treeSig: {
      streamParams,
      funcParams,
      yields,
      returnedIdx,
    },
    tmpl: tmplGroups,
  };
}

export function functionUIAsPlainText(ifaceSpec: FunctionInterfaceSpec): string {
  switch (ifaceSpec.kind) {
    case 'strtext': {
      const textIface = parseStringTextualInterfaceSpec(ifaceSpec.spec);
      return templateToPlainText(textIface.tmpl);
    }

    case 'dtext': {
      const textIface = ifaceSpec.getIface(undefined);
      return templateToPlainText(textIface.tmpl);
    }

    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exhaustive: never = ifaceSpec; // this will cause a type error if we haven't handled all cases
      throw new Error();
    }
  }
}

export function treeSignatureFromInterfaceSpec(ifaceSpec: FunctionInterfaceSpec, settings: ApplicationSettings): TreeSignature {
  switch (ifaceSpec.kind) {
    case 'strtext': {
      const textIface = parseStringTextualInterfaceSpec(ifaceSpec.spec);
      return textIface.treeSig;
    }

    case 'dtext': {
      const textIface = ifaceSpec.getIface(settings);
      return textIface.treeSig;
    }

    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exhaustive: never = ifaceSpec; // this will cause a type error if we haven't handled all cases
      throw new Error();
    }
  }
}
