import React, { ReactNode, useState } from 'react';
import { Node, FunctionDefinitionNode, StreamExpressionNode, NodeKind, isStreamExpressionNode, StreamReferenceNode, ApplicationNode, FunctionInterfaceNode, NameBindingNode, ParamNode, TreeImplBodyNode, FunctionImplNode, TreeImplNode, BindingExpressionNode, StreamBindingNode, UID, TextNode } from '../compiler/Tree';
import './TreeView.css';
import { StaticEnvironment } from '../compiler/TreeUtil';
// import { TemplateLayout, TextSegment, GroupEditable } from '../compiler/TemplateLayout';
import quotesIcon from './icons/quotes.svg';
import booleanIcon from './icons/boolean.svg';
import { makeVirtualSelId, SeltreeNode } from './Seltree';
import { parseTemplateString } from './FITemplate';

export interface TreeViewDisplayOptions {
  wrapWidth: number;
}

export interface TreeViewContext {
  staticEnvMap: ReadonlyMap<Node, StaticEnvironment>;
  onSelectNodeId: (nid: UID) => void;
  displayOpts: TreeViewDisplayOptions;
};

function indentReactNode(node: React.ReactNode): React.ReactNode {
  return <div className='TreeView-indent'>{node}</div>
}

type Size = number | undefined;

interface LayoutUnit {
  reactNode: React.ReactNode;
  size: Size; // undefined if block layout. approximate character length if inline layout.
  seltree: SeltreeNode | undefined;
}

function combineSizes(sizes: ReadonlyArray<Size>, ctx: TreeViewContext): Size {
  let combinedSize: Size = 0;

  for (const size of sizes) {
    if (size === undefined) {
      combinedSize = undefined;
      break;
    } else {
      combinedSize += size;
    }
  }

  if ((combinedSize !== undefined) && (combinedSize > ctx.displayOpts.wrapWidth)) {
    combinedSize = undefined;
  }

  return combinedSize;
}

const UNDERSCORE_SPAN = <span className="TreeView-underscore">_</span>;

// Replace spaces with spans with underscores
function underscore(text: string): ReactNode {
  // NOTE: This could be smarter
  const chunks = text.split(' ');
  const children: Array<ReactNode> = [];
  for (let i = 0; i < chunks.length; i++) {
    children.push(
      <React.Fragment key={i}>
        {(i > 0) && UNDERSCORE_SPAN}
        {chunks[i]}
      </React.Fragment>
    )
  }

  return (
    <span>
      {children}
    </span>
  );
}

const SelectableWrapper: React.FC<{selId: UID, styling: 'common' | 'funcdef', ctx: TreeViewContext}> = ({selId: nid, styling, ctx, children}) => {
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if ((e.target as Element).tagName !== 'INPUT') {
      e.stopPropagation();
      ctx.onSelectNodeId(nid);
    }
  };

  const handleMouseOver = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    setIsHovered(true);
    e.stopPropagation();
  };

  const handleMouseOut = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    setIsHovered(false);
  };

  const classes: Array<string> = ['TreeView-selectable', 'TreeView-selectable-' + styling];

  if (isHovered) {
    classes.push('TreeView-hovered');
  }

  return (
    <div data-nid={nid} className={classes.join(' ')} onClick={handleClick} onMouseOver={handleMouseOver} onMouseOut={handleMouseOut}>
      {children}
    </div>
  );
};

function layoutTextNode(node: TextNode, ctx: TreeViewContext): LayoutUnit {
  return layoutSimpleNode(node, node.text, (node.text.length > 0) ? 'name' : 'name-empty', ctx);
}

interface ArrayItem {
  readonly key: string;
  readonly lo: LayoutUnit;
}

function layoutArray(items: ReadonlyArray<ArrayItem>, addClass: string, forceBlock: boolean, ctx: TreeViewContext, dynEmptySelId?: string): LayoutUnit {
  const size = combineSizes(items.map(item => item.lo.size), ctx);

  let layoutDir: 'inline' | 'block';
  const nonZeroSizeItems = items.filter(item => item.lo.size !== 0);
  if (forceBlock) {
    layoutDir = 'block';
  } else if ((nonZeroSizeItems.length === 1) && (nonZeroSizeItems[0].lo.size !== undefined)) {
    // special case: only one non-zero-size child that is inline, make overall thing inline
    layoutDir = 'inline';
  } else {
    layoutDir = (size === undefined) ? 'block' : 'inline';
  }

  const selChildren: Array<SeltreeNode> = [];
  for (const item of items) {
    if (item.lo.seltree) {
      selChildren.push(item.lo.seltree);
    }
  }

  return {
    reactNode: (
      <div className={'TreeView-array TreeView-' + layoutDir + ' ' + addClass}>
          {items.map(item => (
            <React.Fragment key={item.key}>
              {item.lo.reactNode}
            </React.Fragment>
          ))}
      </div>
    ),
    size,
    seltree: (selChildren.length === 0) ? undefined : {
      dir: layoutDir,
      children: selChildren,
      dynArr: (dynEmptySelId !== undefined),
      dynArrEmptyVnodeSelId: dynEmptySelId,
    },
  }
}

function layoutInsertVirtualNode(selId: string, ctx: TreeViewContext): LayoutUnit {
  return {
    reactNode: (
      <SelectableWrapper key={selId} selId={selId} styling="common" ctx={ctx}><div className="TreeView-insert-virtual" /></SelectableWrapper>
    ),
    size: 1, // sort of arbitrary
    seltree: {
      selId,
      dir: 'inline',
      children: [],
    },
  };
}

function layoutDynamicArray(items: ReadonlyArray<ArrayItem>, addClass: string, dynEmptySelId: string, forceBlock: boolean, ctx: TreeViewContext): LayoutUnit {
  const adjustedItems: ReadonlyArray<ArrayItem> = (items.length === 0) ? [{key: 'ins', lo: layoutInsertVirtualNode(dynEmptySelId, ctx)}] : items;

  return layoutArray(adjustedItems, addClass, forceBlock, ctx, dynEmptySelId);
}

function layoutLabeledItem(preLabel: string | undefined, item: LayoutUnit, postLabel: string | undefined, includeLabelSizes: boolean, ctx: TreeViewContext): LayoutUnit {
  // NOTE: It is intentional that we only go block if the item node is block, and not if the total length with labels is too long.
  const size = (item.size === undefined) ? undefined : (
    includeLabelSizes ? combineSizes([preLabel ? preLabel.length : 0, item.size, postLabel ? postLabel.length : 0], ctx) : item.size
  );

  return {
    reactNode: (
      <div className={'TreeView-li TreeView-' + ((size === undefined) ? 'block' : 'inline')}>
        {preLabel && <div className="TreeView-li-prelabel TreeView-styling-label">{preLabel}</div>}
        <div className="TreeView-li-item">{item.reactNode}</div>
        {postLabel && <div className="TreeView-li-postlabel TreeView-styling-label">{postLabel}</div>}
      </div>
    ),
    size,
    seltree: item.seltree,
  };
}

function layoutSimpleNode(treeNode: Node, content: string, styling: string, ctx: TreeViewContext, icon?: [string, string], undef?: boolean): LayoutUnit {
  return {
    reactNode: (
      <SelectableWrapper key={treeNode.nid} selId={treeNode.nid} styling="common" ctx={ctx}>
        <div className={'TreeView-common-leaf TreeView-leaf-styling-' + styling}>
          {icon && <img className="TreeView-literal-icon" src={icon[0]} alt={icon[1]} />}
          {underscore(content)}
        </div>
      </SelectableWrapper>
    ),
    size: content.length,
    seltree: {
      selId: treeNode.nid,
      dir: 'inline',
      children: [],
      undef,
    },
  };
};

function layoutStreamReferenceNode(node: StreamReferenceNode, ctx: TreeViewContext): LayoutUnit {
  const env = ctx.staticEnvMap.get(node);
  if (!env) {
    throw new Error();
  }
  const envValue = env.get(node.ref);
  if (!envValue) {
    throw new Error();
  }

  // TODO: If the referent is a function, we don't handle this correctly
  if (envValue.name) {
    return layoutSimpleNode(node, envValue.name.text || '\xa0\xa0\xa0\xa0', 'streamref', ctx);
  } else {
    throw new Error();
  }
};

/*
const CustomUIView: React.FC<{logicalReactNode: React.ReactNode, createCustomUI: (underNode: HTMLElement, settings: any, onChange: (change: DynamicInterfaceChange) => void) => () => void, settings: ApplicationSettings, onChange: (change: DynamicInterfaceChange) => void}> = ({logicalReactNode, createCustomUI, settings, onChange}) => {
  const customRef = useRef<HTMLDivElement>(null);

  // We use this ref because we need to always call the most recent onChange that we've been passed, rather than the first
  const latestOnChange = useRef<(change: DynamicInterfaceChange) => void>(onChange);
  latestOnChange.current = onChange;

  useEffect(() => {
    if (!customRef.current) {
      throw new Error('custom UI ref unset');
    }
    createCustomUI(customRef.current, settings, (change) => { latestOnChange.current(change) });
  }, []);

  return (
    <div>
      {logicalReactNode}
      <div ref={customRef} />
    </div>
  );
}
*/

function layoutApplicationNode(node: ApplicationNode, ctx: TreeViewContext): LayoutUnit {
  const env = ctx.staticEnvMap.get(node);
  if (!env) {
    throw new Error();
  }
  const envValue = env.get(node.fid);
  if (!envValue) {
    throw new Error();
  }
  if (!envValue.type || (envValue.type.kind !== NodeKind.FunctionInterface)) {
    throw new Error();
  }
  const funcIface = envValue.type;

  let loApp: LayoutUnit;
  if (funcIface.template) {
    const parsedTemplate = parseTemplateString(funcIface.template, funcIface.params);

    const items: ReadonlyArray<ArrayItem> = parsedTemplate.map(seg => {
      if (seg.kind === 'text') {
        return {
          key: seg.text,
          lo: {
            reactNode: <div className="TreeView-styling-label">{seg.text}</div>,
            size: seg.text.length,
            seltree: undefined,
          },
        };
      } else {
        const param = funcIface.params.find(param => param.nid === seg.pid);
        if (!param) {
          throw new Error();
        }

        const arg = node.args.get(param.nid);
        if (!arg) {
          throw new Error();
        }

        const loNode = layoutStreamExpressionNode(arg, ctx);

        return {
          key: arg.nid,
          lo: layoutLabeledItem(seg.preLabel, loNode, seg.postLabel, true, ctx),
        };
      }
    });

    loApp = layoutArray(items, 'TreeView-app TreeView-tmpl', false, ctx);
  } else {
    const loArgs = layoutArray(funcIface.params.map(param => {
      const arg = node.args.get(param.nid);
      if (!arg) {
        throw new Error();
      }
      return {
        sel: true,
        key: arg.nid,
        lo: layoutLabeledItem(param.name.text, layoutStreamExpressionNode(arg, ctx), undefined, true, ctx),
      };
    }), 'TreeView-app-args', false, ctx);

    // TODO: Force args array to be block if overall application is block?
    loApp = layoutArray([
      {key: 'before-args', lo: {reactNode: <div className="TreeView-app-before-args" ><span className="TreeView-styling-label">{underscore(funcIface.name.text)}</span></div>, size: funcIface.name.text.length, seltree: undefined}},
      {key: 'args', lo: loArgs},
      {key: 'after-args', lo: {reactNode: <div className="TreeView-app-after-args" />, size: 0, seltree: undefined}},
    ], 'TreeView-app TreeView-notmpl', false, ctx);
  }

  return {
    reactNode: (
      <SelectableWrapper key={node.nid} selId={node.nid} styling="common" ctx={ctx}>
        {loApp.reactNode}
      </SelectableWrapper>
    ),
    size: loApp.size,
    seltree: {
      selId: node.nid,
      dir: (loApp.size === undefined) ? 'block' : 'inline',
      children: loApp.seltree ? loApp.seltree.children : [],
    },
  };

  /*
  const ifaceCreateCustomUI = ifaceNode.createCustomUI;
  if (ifaceCreateCustomUI) {
    return {
      reactNode: <CustomUIView logicalReactNode={logicalView.reactNode} createCustomUI={ifaceCreateCustomUI} settings={node.settings} onChange={handleChange} />,
      len: undefined,
    };
  } else {
    return logicalView;
  }
  */
};

export function layoutStreamExpressionNode(node: StreamExpressionNode, ctx: TreeViewContext): LayoutUnit {
  switch (node.kind) {
    case NodeKind.UndefinedLiteral:
      return layoutSimpleNode(node, '', 'undefined', ctx, undefined, true);

    case NodeKind.NumberLiteral:
      return layoutSimpleNode(node, node.val.toString(), 'number', ctx);

    case NodeKind.TextLiteral:
      return layoutSimpleNode(node, node.val, 'text', ctx, [quotesIcon, 'text']);

    case NodeKind.BooleanLiteral:
      return layoutSimpleNode(node, node.val.toString(), 'boolean', ctx, [booleanIcon, 'boolean']);

    case NodeKind.StreamReference:
      return layoutStreamReferenceNode(node, ctx);

    case NodeKind.Application:
      return layoutApplicationNode(node, ctx);

    case NodeKind.FunctionDefinition:
      return layoutFunctionDefinitionNode(node, ctx);

    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
      throw new Error();
    }
  }
}

function layoutNameBindingNode(node: NameBindingNode, ctx: TreeViewContext): LayoutUnit {
  return layoutTextNode(node.name, ctx);
}

function layoutBindingExpressionNode(node: BindingExpressionNode, ctx: TreeViewContext): LayoutUnit {
  switch (node.kind) {
    case NodeKind.NameBinding:
      return layoutNameBindingNode(node, ctx);

    default: {
      throw new Error();
    }
  }
}

function layoutParamNode(node: ParamNode, ctx: TreeViewContext): LayoutUnit {
  let loParamChild: LayoutUnit;

  // TODO: We don't yet properly support a param having a name AND a type
  if (node.type === null) {
    loParamChild = layoutTextNode(node.name, ctx);
  } else {
    loParamChild = layoutFunctionInterfaceNode(node.type, ctx);
  }

  if (!loParamChild.seltree) {
    throw new Error();
  }

  return {
    reactNode: <SelectableWrapper key={node.nid} selId={node.nid} styling="common" ctx={ctx}>{loParamChild.reactNode}</SelectableWrapper>,
    size: loParamChild.size,
    seltree: {
      selId: node.nid,
      dir: loParamChild.size === undefined ? 'block' : 'inline',
      children: [loParamChild.seltree],
    },
  };
}

function layoutFunctionInterfaceNode(node: FunctionInterfaceNode, ctx: TreeViewContext): LayoutUnit {
  const loBeforeParams = layoutArray([
    {key: 'before-fn', lo: {reactNode: <div className="TreeView-iface-before-params-before-fn" />, size: 0, seltree: undefined}},
    {key: 'fn', lo: layoutTextNode(node.name, ctx)},
    {key: 'after-fn', lo: {reactNode: <div className="TreeView-iface-before-params-after-fn" />, size: 0, seltree: undefined}},
  ], 'TreeView-iface-before-params', false, ctx);

  const loParamItems: ReadonlyArray<ArrayItem> = node.params.map(n => ({
    sel: true,
    key: n.nid,
    lo: layoutParamNode(n, ctx),
  }));
  const loParams = layoutDynamicArray(loParamItems, 'TreeView-iface-params', makeVirtualSelId(node.nid, 'params'), false, ctx);

  let loAfterParamsItem: ArrayItem;
  if (node.output.kind === NodeKind.Void) {
    loAfterParamsItem = {key: 'after-params', lo: {reactNode: <div className="TreeView-iface-after-params-void" />, size: 0, seltree: undefined}};
  } else {
    loAfterParamsItem = {
      key: 'after-params',
      lo: layoutArray([
        {key: 'before-out', lo: {reactNode: <div className="TreeView-iface-after-params-before-out" />, size: 0, seltree: undefined}},
        {key: 'out', lo: layoutSimpleNode(node.output, 'any', 'name', ctx)},
        {key: 'after-out', lo: {reactNode: <div className="TreeView-iface-after-params-after-out" />, size: 0, seltree: undefined}},
      ], 'TreeView-iface-after-params', false, ctx),
    };
  }

  // TODO: Force params array to be block if overall function interface is block?
  return layoutArray([
    {key: 'before-params', lo: loBeforeParams},
    {key: 'params', lo: loParams},
    loAfterParamsItem,
  ], 'TreeView-iface', false, ctx);
}

export function layoutStreamBindingNode(node: StreamBindingNode, ctx: TreeViewContext): LayoutUnit {
  const loBindingExpr = layoutBindingExpressionNode(node.bexpr, ctx);
  const loStreamExpr = layoutStreamExpressionNode(node.sexpr, ctx);

  const size = combineSizes([loBindingExpr.size, 1, loStreamExpr.size], ctx);

  let reactNode: React.ReactNode;
  let seltree: SeltreeNode;

  if (!loBindingExpr.seltree || !loStreamExpr.seltree) {
    throw new Error();
  }

  if (size === undefined) {
    // block
    reactNode = (
      <SelectableWrapper key={node.nid} selId={node.nid} styling="common" ctx={ctx}>
        <div>
          <div className="TreeView-stream-binding-binding">{loBindingExpr.reactNode} =</div>
          {indentReactNode(loStreamExpr.reactNode)}
        </div>
      </SelectableWrapper>
    );
    seltree = {
      selId: node.nid,
      dir: 'block',
      children: [loBindingExpr.seltree, loStreamExpr.seltree],
    };
  } else {
    // inline
    reactNode = (
      <SelectableWrapper key={node.nid} selId={node.nid} styling="common" ctx={ctx}>
        <span>{loBindingExpr.reactNode} = {loStreamExpr.reactNode}</span>
      </SelectableWrapper>
    );
    seltree = {
      selId: node.nid,
      dir: 'inline',
      children: [loBindingExpr.seltree, loStreamExpr.seltree],
    };
  }

  return {
    reactNode,
    size,
    seltree,
  };
}

function layoutTreeImplBodyNode(node: TreeImplBodyNode, ctx: TreeViewContext): LayoutUnit {
  if (isStreamExpressionNode(node)) {
    return layoutStreamExpressionNode(node, ctx);
  } else if (node.kind === NodeKind.StreamBinding) {
    return layoutStreamBindingNode(node, ctx);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
    throw new Error('unreachable');
  }
};

function layoutTreeImplNode(node: TreeImplNode, iface: FunctionInterfaceNode, forceBlock: boolean, ctx: TreeViewContext): LayoutUnit {
  const items: Array<ArrayItem> = [];

  let outputBodyNode: StreamExpressionNode | null;
  if (iface.output.kind === NodeKind.Void) {
    outputBodyNode = null;
  } else {
    if (node.body.length === 0) {
      throw new Error();
    }
    const lastBodyNode = node.body[node.body.length-1];
    if (!isStreamExpressionNode(lastBodyNode)) {
      throw new Error();
    }
    outputBodyNode = lastBodyNode;
  }

  for (const n of node.body) {
    if (n === outputBodyNode) {
      const loExpr = layoutStreamExpressionNode(n, ctx);
      const loOutput = layoutLabeledItem('←', loExpr, undefined, false, ctx);
      if (!loOutput.seltree) {
        throw new Error();
      }
      // Note: We modify loOutput to have the fixedFinal flag
      items.push({
        key: n.nid,
        lo: {
          ...loOutput,
          seltree: {
            ...loOutput.seltree,
            fixedFinal: true,
          },
        },
      });
    } else {
      items.push({key: n.nid, lo: layoutTreeImplBodyNode(n, ctx)});
    }
  }

  return layoutDynamicArray(items, 'TreeView-impl-body-nodes', makeVirtualSelId(node.nid, 'body'), forceBlock, ctx);
}

function layoutFunctionImplNode(node: FunctionImplNode, iface: FunctionInterfaceNode, forceBlock: boolean, ctx: TreeViewContext): LayoutUnit {
  switch (node.kind) {
    case NodeKind.NativeImpl:
      throw new Error('unimplemented');

    case NodeKind.TreeImpl:
      return layoutTreeImplNode(node, iface, forceBlock, ctx);

    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
      throw new Error();
    }
  }
}

export function layoutFunctionDefinitionNode(node: FunctionDefinitionNode, ctx: TreeViewContext): LayoutUnit {
  const loIface = layoutFunctionInterfaceNode(node.iface, ctx);
  const loImpl = layoutFunctionImplNode(node.impl, node.iface, true, ctx);

  if (!loIface.seltree || !loImpl.seltree) {
    throw new Error();
  }

  return {
    reactNode: (
      <SelectableWrapper key={node.nid} selId={node.nid} styling="funcdef" ctx={ctx}>
        <div className="TreeView-funcdef">
          <div className="TreeView-funcdef-iface">{loIface.reactNode}</div>
          <div className="TreeView-funcdef-impl">{loImpl.reactNode}</div>
          <div className="TreeView-funcdef-closer"><span /></div>
        </div>
      </SelectableWrapper>
    ),
    size: undefined,
    seltree: {
      selId: node.nid,
      dir: 'block',
      children: [loIface.seltree, loImpl.seltree],
    },
  };
};

export function layoutAnyNode(node: Node, ctx: TreeViewContext): LayoutUnit {
  if (isStreamExpressionNode(node)) {
    return layoutStreamExpressionNode(node, ctx);
  } else if (node.kind === NodeKind.StreamBinding) {
    return layoutStreamBindingNode(node, ctx);
  } else if (node.kind === NodeKind.Text) {
    return layoutTextNode(node, ctx);
  } else {
    throw new Error();
  }
}
