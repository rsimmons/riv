import React, { useState } from 'react';
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
  seltree: SeltreeNode;
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

/**
 * LABELED LAYOUT
 */
interface LSTextItem {
  kind: 'text';
  text: string;
}
interface LSNodeItem {
  kind: 'node';
  preLabel: string;
  postLabel: string;
  node: LayoutUnit;
}
type LabeledStructureItem = LSTextItem | LSNodeItem;
type LabeledStructure = ReadonlyArray<LabeledStructureItem>;

function layoutLabeledStructure(struct: LabeledStructure, ctx: TreeViewContext): LayoutUnit {
  const reactNodes: Array<React.ReactNode> = [];
  const seltreeChildren: Array<SeltreeNode> = [];

  const size = combineSizes(struct.map(item => {
    if (item.kind === 'text') {
      return item.text.length;
    } else {
      if (item.node.size === undefined) {
        return undefined;
      } else {
        return item.preLabel.length + item.postLabel.length + item.node.size;
      }
    }
  }), ctx);

  for (const item of struct) {
    if (item.kind === 'text') {
      reactNodes.push(
        <div className="TreeView-ls-text">{item.text}</div>
      );
    } else {
      // NOTE: It is intentional that we only go block if the item node is block, and not if the total length with labels is too long.
      const itemSize = (item.node.size === undefined) ? undefined : (item.preLabel.length + item.postLabel.length + item.node.size);

      seltreeChildren.push(item.node.seltree);

      if (itemSize === undefined) {
        reactNodes.push(
          <div className="TreeView-ls-node-block">
            {item.preLabel && <div className="TreeView-ls-node-prelabel">{item.preLabel}</div>}
            {indentReactNode(item.node.reactNode)}
            {item.postLabel && <div className="TreeView-ls-node-postlabel">{item.postLabel}</div>}
          </div>
        );
      } else {
        reactNodes.push(
          <div className="TreeView-ls-node-inline">
            {item.preLabel && <div className="TreeView-ls-node-prelabel">{item.preLabel}</div>}
            {item.node.reactNode}
            {item.postLabel && <div className="TreeView-ls-node-postlabel">{item.postLabel}</div>}
          </div>
        );
      }
    }
  }

  const dir = (size === undefined) ? 'block' : 'inline';

  return {
    reactNode: (
      <div className={'TreeView-ls-' + dir}>
        {reactNodes.map(node => (
          <div className={'TreeView-ls-' + dir + '-item'}>{node}</div>
        ))}
      </div>
    ),
    size,
    seltree: {
      dir,
      children: seltreeChildren,
    },
  };
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
  return layoutSimpleNode(node, node.text || '\xa0\xa0\xa0\xa0', 'name', ctx);
}

function layoutInsertVirtualNode(selId: string, ctx: TreeViewContext): LayoutUnit {
  return {
    reactNode: (
      <SelectableWrapper key={selId} selId={selId} styling="common" ctx={ctx}><div className="TreeView-common-leaf">+</div></SelectableWrapper>
    ),
    size: 1, // sort of arbitrary
    seltree: {
      selId,
      dir: 'inline',
      children: [],
    },
  };
}

function layoutArray(items: ReadonlyArray<LayoutUnit>, dynEmptySelId: string | undefined, forceBlock: boolean, ctx: TreeViewContext): LayoutUnit {
  let adjustedItems: ReadonlyArray<LayoutUnit>;
  if ((dynEmptySelId !== undefined) && (items.length === 0)) {
    adjustedItems = [layoutInsertVirtualNode(dynEmptySelId, ctx)];
  } else {
    adjustedItems = items;
  }

  const size = combineSizes(adjustedItems.map(item => item.size), ctx);

  const layoutDir = forceBlock ? 'block' : ((size === undefined) ? 'block' : 'inline');

  return {
    reactNode: (
      <div className={'TreeView-array-' + layoutDir}>
        {adjustedItems.map(item => (
          <div className={'TreeView-array-' + layoutDir + '-item'}>{item.reactNode}</div>
        ))}
      </div>
    ),
    size,
    seltree: {
      dir: layoutDir,
      children: adjustedItems.map(item => item.seltree),
      dynArr: (dynEmptySelId !== undefined),
      dynArrEmptyVnodeSelId: dynEmptySelId,
    },
  }
}

function layoutSimpleNode(treeNode: Node, content: string, styling: string, ctx: TreeViewContext, icon?: [string, string], undef?: boolean): LayoutUnit {
  return {
    reactNode: (
      <SelectableWrapper key={treeNode.nid} selId={treeNode.nid} styling="common" ctx={ctx}>
        <div className={'TreeView-common-leaf TreeView-leaf-styling-' + styling}>
          {icon && <img className="TreeView-literal-icon" src={icon[0]} alt={icon[1]} />}
          {content}
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

  const lsItems: Array<LabeledStructureItem> = [];
  if (funcIface.template) {
    const parsedTemplate = parseTemplateString(funcIface.template, funcIface.params);

    for (const seg of parsedTemplate) {
      if (seg.kind === 'text') {
        lsItems.push({
          kind: 'text',
          text: seg.text,
        });
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

        lsItems.push({
          kind: 'node',
          preLabel: seg.preLabel,
          postLabel: seg.postLabel,
          node: loNode,
        });
      }
    }
  } else {
    lsItems.push({
      kind: 'text',
      text: funcIface.name.text,
    });

    for (const param of funcIface.params) {
      const arg = node.args.get(param.nid);
      if (!arg) {
        throw new Error();
      }

      lsItems.push({
        kind: 'node',
        preLabel: param.name.text,
        postLabel: '',
        node: layoutStreamExpressionNode(arg, ctx),
      });
    }
  }

  const loStructure = layoutLabeledStructure(lsItems, ctx);

  const dir = loStructure.size === undefined ? 'block' : 'inline';

  return {
    reactNode: (
      <SelectableWrapper key={node.nid} selId={node.nid} styling="common" ctx={ctx}>
        <div className={'TreeView-app-' + dir}>
          {loStructure.reactNode}
        </div>
      </SelectableWrapper>
    ),
    size: loStructure.size,
    seltree: {
      selId: node.nid,
      dir,
      children: loStructure.seltree.children.length ? [loStructure.seltree] : [], // avoid creating empty child
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
      return layoutSimpleNode(node, '\xa0\xa0\xa0\xa0', 'undefined', ctx, undefined, true);

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
  const loName = layoutTextNode(node.name, ctx)
  const loParams = node.params.map(n => layoutParamNode(n, ctx));

  let loOutput: LayoutUnit | undefined;
  if (node.output.kind === NodeKind.Void) {
    loOutput = undefined;
  } else {
    const loOutputType = layoutSimpleNode(node.output, 'any', 'name', ctx);
    if (loOutputType.size === undefined) {
      throw new Error();
    }
    loOutput = {
      reactNode: <div><span className="TreeView-iface-out-sym"><span /></span> {loOutputType.reactNode}</div>,
      size: loOutputType.size,
      seltree: {
        dir: 'inline',
        children: [loOutputType.seltree],
      },
    };
  }

  const sizingItems: ReadonlyArray<LayoutUnit> = [loName, ...loParams, ...(loOutput ? [loOutput] : [])];
  const combinedSize = combineSizes(sizingItems.map(item => item.size), ctx);

  // Force params array to be block if overall function interface is block, so it doesn't look weird
  const loParamsArray = layoutArray(loParams, makeVirtualSelId(node.nid, 'params'), (combinedSize === undefined), ctx);

  const dir = (combinedSize === undefined) ? 'block' : 'inline';

  return {
    reactNode: (
      <div className="TreeView-func-padding">
        <div className={'TreeView-iface TreeView-iface-' + dir}>
          <div className="TreeView-iface-before-params">
            <div className="TreeView-iface-fn-sym"><span /></div>
            <div className="TreeView-iface-name">{loName.reactNode}</div>
          </div>
          <div className="TreeView-iface-params">{loParamsArray.reactNode}</div>
          <div className="TreeView-iface-after-params">
            {loOutput && <div className="TreeView-iface-output">{loOutput.reactNode}</div>}
          </div>
        </div>
      </div>
    ),
    size: combinedSize,
    seltree: {
      dir,
      children: [loName.seltree, loParamsArray.seltree, ...(loOutput ? [loOutput.seltree] : [])],
    },
  };
}

export function layoutStreamBindingNode(node: StreamBindingNode, ctx: TreeViewContext): LayoutUnit {
  const loBindingExpr = layoutBindingExpressionNode(node.bexpr, ctx);
  const loStreamExpr = layoutStreamExpressionNode(node.sexpr, ctx);

  const size = combineSizes([loBindingExpr.size, 1, loStreamExpr.size], ctx);

  let reactNode: React.ReactNode;
  let seltree: SeltreeNode;

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
  const items: Array<LayoutUnit> = [];

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
      const loOutput = layoutLabeledStructure([
        {kind: 'text', text: '←'},
        {
          kind: 'node',
          preLabel: '',
          postLabel: '',
          node: loExpr,
        },
      ], ctx);

      // This is sort of weird. We "extract" the single child of the seltree, so that it isn't "wrapped".
      // Because this is an element of a dynamic array, it must have a selId, which it won't unless we do this.
      // Also, we update the flags to have noInsertAfter.
      items.push({
        reactNode: loOutput.reactNode,
        size: loOutput.size,
        seltree: {
          ...loExpr.seltree,
          fixedFinal: true,
        },
      });
    } else {
      items.push(layoutTreeImplBodyNode(n, ctx));
    }
  }
  const loImplInner = layoutArray(items, makeVirtualSelId(node.nid, 'body'), forceBlock, ctx);

  return {
    ...loImplInner,
    reactNode: <div className="TreeView-func-padding">{loImplInner.reactNode}</div>,
  }
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
