import { TextualSyntaxTemplate, templateToPlainText, TemplateSegment } from './TextualSyntaxTemplate';
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
  tmpl: TextualSyntaxTemplate;
}

// This IS stored in saved code.
interface StringTextualFunctionInterfaceSpec {
  kind: 'strtext';
  spec: string;
}

// This IS stored in saved code. (or well, should be once we fix it)
interface DynamicTextualFunctionInterfaceSpec {
  kind: 'dtext';
  getIface: (settings: ApplicationSettings) => TextualFunctionInterface; // TODO: this should be a JS code string so we can store it
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

  const tmplSegs: Array<TemplateSegment> = [];

  const streamParamFromIdx: Map<number, TreeSignatureStreamParam> = new Map();
  const funcParamFromIdx: Map<number, TreeSignatureFuncParam> = new Map();
  const yieldFromIdx: Map<number, TreeSignatureYield> = new Map();

  for (const seg of parseResult.tmplSegs) {
    switch (seg.segKind) {
      case 'text':
        tmplSegs.push({
          kind: 'text',
          text: seg.text,
        });
        break;

      case 'placeholder':
        tmplSegs.push({
          kind: 'wildcard',
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
        tmplSegs.push({
          kind: 'linebreak',
        });
        break;

      default:
        throw new Error();
    }
  }

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
    tmpl: tmplSegs,
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
