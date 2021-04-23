import { ParamNode, UID } from "../compiler/Tree";

export interface TextSegment {
  kind: 'text';
  text: string;
}

export interface ParamSegment {
  kind: 'param';
  pid: UID; // parameter id
  preLabel: string;
  postLabel: string;
}

export type FITemplateSegment = TextSegment | ParamSegment;

export type FITemplate = ReadonlyArray<FITemplateSegment>;

export function templateToPlainText(template: FITemplate): string {
  const resultPieces: Array<string> = [];

  for (const segment of template) {
    if (segment.kind === 'text') {
      resultPieces.push(segment.text);
    } else {
      if (segment.preLabel) {
        resultPieces.push(segment.preLabel);
      }
      if (segment.postLabel) {
        resultPieces.push(segment.postLabel);
      }
    }
  }

  return resultPieces.join(' ');
}

export function parseTemplateString(tmpl: string, params: ReadonlyArray<ParamNode>): FITemplate {
  const result: Array<FITemplateSegment> = [];

  const segs = tmpl.split(/(\$[0-9]+)/); // NOTE: not robust, doesn't support escaping $

  const paramIdxToId = new Map(params.map((param, idx) => [idx, param.nid]));
  const getParamId = (idx: number) => {
    const pid = paramIdxToId.get(idx);
    if (!pid) {
      throw new Error();
    }
    return pid;
  }

  for (const segtext of tmpl.split('|')) {
    const cleanSegtext = segtext.trim();
    const pieces = cleanSegtext.split(/(\$[0-9]+)/).filter(p => p); // NOTE: not robust, doesn't support escaping $
    if (pieces.length === 1) {
      if (pieces[0].startsWith('$')) {
        const idx = +(pieces[0].substr(1));
        result.push({
          kind: 'param',
          pid: getParamId(idx),
          preLabel: '',
          postLabel: '',
        });
      } else {
        result.push({
          kind: 'text',
          text: pieces[0],
        });
      }
    } else if (pieces.length === 2) {
      if (pieces[0].startsWith('$')) {
        const idx = +(pieces[0].substr(1));
        result.push({
          kind: 'param',
          pid: getParamId(idx),
          preLabel: '',
          postLabel: pieces[1].trim(),
        });
      } else if (pieces[1].startsWith('$')) {
        const idx = +(pieces[1].substr(1));
        result.push({
          kind: 'param',
          pid: getParamId(idx),
          preLabel: pieces[0].trim(),
          postLabel: '',
        });
      } else {
        throw new Error();
      }
    } else if (pieces.length === 3) {
      if (!pieces[1].startsWith('$')) {
        throw new Error();
      }
      const idx = +(pieces[1].substr(1));
      result.push({
        kind: 'param',
        pid: getParamId(idx),
        preLabel: pieces[0].trim(),
        postLabel: pieces[2].trim(),
      });
    } else {
      throw new Error();
    }
  }

  return result;
}
