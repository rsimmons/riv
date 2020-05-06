import { TemplateSegment, TemplateGroup, TemplateLayout, templateToPlainText } from './TemplateLayout';
import { ApplicationSettings, FunctionInterfaceNode, NodeKind, StaticFunctionInterfaceNode, TreeFunctionDefinitionNode, generateFunctionId, generateStreamId, FITmplSegNode, FIOutNode, NameNode, FINothingNode } from './Tree';
const pegParser = require('./parseStringTextualFunctionInterfaceSpec');

/**
 * This is the internal representation of a function interface. It is not stored or directly edited.
 */
export interface StreamParam {
  readonly name: string | undefined;
  // readonly type: Type;
}

export interface FunctionParam {
  readonly iface: FunctionInterface;
  // NOTE: The interface have a template (in lieu of a name) and type,
  //  so we don't need those fields here.
}

export interface Out {
  readonly name: string | undefined;
  // readonly type: Type;
}

export interface FunctionInterface {
  readonly streamParams: ReadonlyArray<StreamParam>;
  readonly funcParams: ReadonlyArray<FunctionParam>;
  readonly outs: ReadonlyArray<Out>;
  readonly returnedIdx: number | null;
  readonly tmpl: TemplateLayout;
}

export type DynamicInterfaceEditAction = 'insert-before' | 'insert-after' | 'delete';

export type DynamicInterfaceChange = {
  readonly newSettings: ApplicationSettings;
  readonly remap?: {
    // for each of these, the array is of indexes into the old params/yields
    streamParams: ReadonlyArray<number | undefined>;
    funcParams: ReadonlyArray<number | undefined>;
    yields: ReadonlyArray<number | undefined>;
  }
  readonly newSelectedKey?: string | 'parent';
}

export class InterfaceSpecParseError extends Error {
};

export function parseInterfaceFromString(spec: string): StaticFunctionInterfaceNode {
  let parseResult;
  try {
    parseResult = pegParser.parse(spec);
  } catch (e) {
    throw new InterfaceSpecParseError(e.message);
  }

  return transformParsedInterface(parseResult);
}

function transformParsedInterface(parseResult: any): StaticFunctionInterfaceNode {
  const segs: Array<FITmplSegNode> = [];

  const nameNodeFromString = (text: string): NameNode => ({kind: NodeKind.Name, text: text || ''});

  for (const seg of parseResult.tmplSegs) {
    switch (seg.segKind) {
      case 'text':
        segs.push({
          kind: NodeKind.FIText,
          text: seg.text,
        });
        break;

      case 'placeholder':
        switch (seg.info.pkind) {
          case 's':
            segs.push({
              kind: NodeKind.FIStreamParam,
              idx: seg.info.idx,
              name: nameNodeFromString(seg.info.name),
            });
            break;

          case 'f':
            if (seg.info.type.typeKind !== 'func') {
              throw new Error('function param does not have function type');
            }
            segs.push({
              kind: NodeKind.FIFunctionParam,
              idx: seg.info.idx,
              iface: transformParsedInterface(seg.info.type.type),
            });
            break;

          case 'y':
            segs.push({
              kind: NodeKind.FIOut,
              idx: seg.info.idx,
              name: nameNodeFromString(seg.info.name),
            });
            break;

          default:
            throw new Error();
        }
        break;

      case 'break':
        segs.push({
          kind: NodeKind.FIBreak,
        });
        break;

      default:
        throw new Error();
    }
  }

  let ret: FIOutNode | FINothingNode;
  if (parseResult.ret) {
    if (parseResult.ret.pkind !== 'y') {
      throw new Error();
    }
    ret = {
      kind: NodeKind.FIOut,
      idx: parseResult.ret.idx,
      name: nameNodeFromString(parseResult.ret.name),
    };
  } else {
    ret = {
      kind: NodeKind.FINothing,
    };
  }

  return {
    kind: NodeKind.StaticFunctionInterface,
    segs,
    ret,
  };
}

export function functionInterfaceAsPlainText(ifaceNode: FunctionInterfaceNode): string {
  return templateToPlainText(functionInterfaceFromNode(ifaceNode).tmpl);
}

export function functionInterfaceFromNode(node: FunctionInterfaceNode): FunctionInterface {
  switch (node.kind) {
    case NodeKind.StaticFunctionInterface:
      return functionInterfaceFromStaticNode(node);

    case NodeKind.DynamicFunctionInterface:
      return node.getIface(undefined);

    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
      throw new Error();
    }
  }
}

export function functionInterfaceFromStaticNode(node: StaticFunctionInterfaceNode): FunctionInterface {
  const tmplGroups: Array<TemplateGroup> = [];
  let groupSegs: Array<TemplateSegment> = [];

  const sparamFromIdx: Map<number, StreamParam> = new Map();
  const fparamFromIdx: Map<number, FunctionParam> = new Map();
  const outFromIdx: Map<number, Out> = new Map();

  const emitGroup = () => {
    if (groupSegs.length > 0) {
      tmplGroups.push({
        segments: groupSegs,
      });
    }
    groupSegs = [];
  };

  for (const seg of node.segs) {
    switch (seg.kind) {
      case NodeKind.FIText:
        groupSegs.push({
          kind: 'text',
          text: seg.text,
        });
        break;

      case NodeKind.FIStreamParam:
        groupSegs.push({
          kind: 'placeholder',
          key: 's' + seg.idx,
        });
        sparamFromIdx.set(seg.idx, {
          name: seg.name.text ? seg.name.text : undefined,
        });
        break;

      case NodeKind.FIFunctionParam:
        groupSegs.push({
          kind: 'placeholder',
          key: 'f' + seg.idx,
        });
        fparamFromIdx.set(seg.idx, {
          iface: functionInterfaceFromStaticNode(seg.iface),
        });
        break;

      case NodeKind.FIOut:
        groupSegs.push({
          kind: 'placeholder',
          key: 'y' + seg.idx,
        });
        outFromIdx.set(seg.idx, {
          name: seg.name.text ? seg.name.text : undefined,
        });
        break;

      case NodeKind.FIBreak:
        emitGroup();
        break;

      default: {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const exhaustive: never = seg; // this will cause a type error if we haven't handled all cases
        throw new Error();
      }
    }
  }
  emitGroup();

  let returnedIdx: number | null = null;
  if (node.ret.kind === NodeKind.FIOut) {
    returnedIdx = node.ret.idx;
    outFromIdx.set(node.ret.idx, {
      name: node.ret.name.text ? node.ret.name.text : undefined,
    });
  } else if (node.ret.kind === NodeKind.FINothing) {
    // pass
  } else {
    throw new Error();
  }

  const streamParams: Array<StreamParam> = [];
  let idx = 0;
  while (true) {
    const info = sparamFromIdx.get(idx);
    if (info === undefined) {
      break;
    }
    streamParams.push(info);
    idx++;
  }
  if (sparamFromIdx.size !== idx) {
    throw new Error('must be gap in indexes');
  }

  const funcParams: Array<FunctionParam> = [];
  idx = 0;
  while (true) {
    const info = fparamFromIdx.get(idx);
    if (info === undefined) {
      break;
    }
    funcParams.push(info);
    idx++;
  }
  if (fparamFromIdx.size !== idx) {
    throw new Error('must be gap in indexes');
  }

  const outs: Array<Out> = [];
  idx = 0;
  while (true) {
    const info = outFromIdx.get(idx);
    if (info === undefined) {
      break;
    }
    outs.push(info);
    idx++;
  }
  if (outFromIdx.size !== idx) {
    throw new Error('must be gap in indexes');
  }

  return {
    streamParams,
    funcParams,
    outs,
    returnedIdx,
    tmpl: tmplGroups,
  };
}

export function functionInterfaceToStaticNode(iface: FunctionInterface): StaticFunctionInterfaceNode {
  const segs: Array<FITmplSegNode> = [];

  iface.tmpl.forEach((tmplGroup, groupIdx) => {
    for (const seg of tmplGroup.segments) {
      switch (seg.kind) {
        case 'text':
          segs.push({
            kind: NodeKind.FIText,
            text: seg.text,
          });
          break;

        case 'placeholder':
          const ptype = seg.key[0]; // hacky to "parse" this out
          const idx = +seg.key.slice(1);
          switch (ptype) {
            case 's':
              segs.push({
                kind: NodeKind.FIStreamParam,
                idx,
                name: {kind: NodeKind.Name, text: iface.streamParams[idx].name || ''},
              });
              break;

            case 'f':
              segs.push({
                kind: NodeKind.FIFunctionParam,
                idx,
                iface: functionInterfaceToStaticNode(iface.funcParams[idx].iface),
              });
              break;

            case 'y':
              segs.push({
                kind: NodeKind.FIOut,
                idx,
                name: {kind: NodeKind.Name, text: iface.outs[idx].name || ''},
              });
              break;

            default:
              throw new Error();
          }
          break;

        default: {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const exhaustive: never = seg; // this will cause a type error if we haven't handled all cases
          throw new Error();
        }
      }
    }
    // add a break if this isn't the last group
    if (groupIdx !== (iface.tmpl.length-1)) {
      segs.push({
        kind: NodeKind.FIBreak,
      });
    }
  });

  return {
    kind: NodeKind.StaticFunctionInterface,
    segs,
    ret: (iface.returnedIdx === null) ? {
      kind: NodeKind.FINothing,
    } : {
      kind: NodeKind.FIOut,
      idx: iface.returnedIdx,
      name: {kind: NodeKind.Name, text: iface.outs[iface.returnedIdx].name || ''},
    },
  };
}

export function defaultTreeImplFromFunctionInterface(iface: FunctionInterface): TreeFunctionDefinitionNode {
  const ifaceNode = functionInterfaceToStaticNode(iface);

  return {
    kind: NodeKind.TreeFunctionDefinition,
    fid: generateFunctionId(),
    iface: ifaceNode,
    spids: iface.streamParams.map(() => generateStreamId()),
    fpids: iface.funcParams.map(() => generateFunctionId()),
    bodyExprs: iface.outs.map((_, idx) => ({
      kind: NodeKind.YieldExpression,
      idx,
      expr: {
        kind: NodeKind.UndefinedLiteral,
        sid: generateStreamId(),
      },
    })),
  };
}
