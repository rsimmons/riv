import React, { useState } from 'react';
import { Node, FunctionDefinitionNode, StreamExpressionNode, NodeKind, isStreamExpressionNode, StreamReferenceNode, ApplicationNode, FunctionInterfaceNode, NameBindingNode, ParamNode, StreamParamNode, TreeImplBodyNode, FunctionImplNode, TreeImplNode, BindingExpressionNode, StreamBindingNode, UID, TextNode } from '../compiler/Tree';
import './TreeView.css';
import { StaticEnvironment } from '../editor/EditorReducer';
// import { TemplateLayout, TextSegment, GroupEditable } from '../compiler/TemplateLayout';
import quotesIcon from './icons/quotes.svg';
import booleanIcon from './icons/boolean.svg';
import { SeltreeNode } from './Seltree';
// import { DynamicInterfaceEditAction, DynamicInterfaceChange } from '../compiler/FunctionInterface';

const BOUND_NAME_BOX_COLOR = 'rgb(111, 66, 193)';
const STREAM_REFERENCE_BOX_COLOR = '#1d8a3b';

export interface TreeViewContext {
  staticEnvMap: ReadonlyMap<Node, StaticEnvironment>;
  onSelectNodeId: (nid: UID) => void;
};

function layoutReactNodes(nodes: ReadonlyArray<React.ReactNode>, dir: 'block' | 'inline'): React.ReactNode {
  return (
    <div className={'TreeView-layout-' + dir}>
      {nodes.map(node => (
        <div className={'TreeView-layout-' + dir + '-item'}>{node}</div>
      ))}
    </div>
  );
}

function indentReactNode(node: React.ReactNode): React.ReactNode {
  return <div className='TreeView-indent'>{node}</div>
}

type Size = number | undefined;

interface LayoutUnit {
  reactNode: React.ReactNode;
  size: Size; // undefined if block layout. approximate character length if inline layout.
  seltree: SeltreeNode;
}

function combineSizes(sizes: ReadonlyArray<Size>): Size {
  let combinedSize: Size = 0;

  for (const size of sizes) {
    if (size === undefined) {
      combinedSize = undefined;
      break;
    } else {
      combinedSize += size;
    }
  }

  if ((combinedSize !== undefined) && (combinedSize > MAX_ROW_WIDTH)) {
    combinedSize = undefined;
  }

  return combinedSize;
}

function layoutLabeledItem(label: string, item: LayoutUnit): LayoutUnit {
  // TODO: Do we want to line-break if total size with label is too long?
  const labelNode = <div className="TreeView-common-leaf">{label}</div>;

  if (item.size === undefined) {
    return {
      reactNode: layoutReactNodes([
        labelNode,
        indentReactNode(item.reactNode),
      ], 'block'),
      size: undefined,
      seltree: {
        dir: 'block',
        children: [item.seltree],
        flags: {},
      },
    };
  } else {
    return {
      reactNode: layoutReactNodes([labelNode, item.reactNode], 'inline'),
      size: item.size, // TODO: include label?
      seltree: {
        dir: 'inline',
        children: [item.seltree],
        flags: {},
      },
    };
  }
}

const SelectableWrapper: React.FC<{selId: UID, style: 'common' | 'funcdef', ctx: TreeViewContext}> = ({selId: nid, style, ctx, children}) => {
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

  const classes: Array<string> = ['TreeView-selectable', 'TreeView-selectable-' + style];

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
  return layoutSimpleNode(node, node.text || '\xa0\xa0\xa0\xa0', BOUND_NAME_BOX_COLOR, ctx);
}

const MAX_ROW_WIDTH = 30;

function layoutArray(items: ReadonlyArray<LayoutUnit>, dyn: boolean): LayoutUnit {
  const size = combineSizes(items.map(item => item.size));

  const layoutDir = (size === undefined) ? 'block' : 'inline';

  return {
    reactNode: layoutReactNodes(items.map(item => item.reactNode), layoutDir),
    size,
    seltree: {
      dir: layoutDir,
      children: items.map(item => item.seltree),
      flags: {
        dyn,
      },
    },
  }
}

function layoutSimpleNode(treeNode: Node, content: string, bgColor: string, ctx: TreeViewContext, icon?: [string, string]): LayoutUnit {
  return {
    reactNode: (
      <SelectableWrapper selId={treeNode.nid} style="common" ctx={ctx}>
        <div className="TreeView-common-leaf" style={{color: bgColor}}>
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
      flags: {},
    },
  };
};



function layoutStreamReferenceNode(node: StreamReferenceNode, ctx: TreeViewContext): LayoutUnit {
  const env = ctx.staticEnvMap.get(node);
  if (!env) {
    throw new Error();
  }
  const nameBinding = env.streamEnv.get(node.ref);
  if (!nameBinding) {
    throw new Error();
  }

  return layoutSimpleNode(node, nameBinding.name.text || '\xa0\xa0\xa0\xa0', STREAM_REFERENCE_BOX_COLOR, ctx);
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
  const funcIface = env.functionEnv.get(node.fid);
  if (!funcIface) {
    throw new Error();
  }

  const loArgs: Array<LayoutUnit> = [];

  for (const param of funcIface.params) {
    const arg = node.args.get(param.nid);
    if (!arg) {
      throw new Error();
    }

    switch (param.kind) {
      case NodeKind.StreamParam:
        if (!isStreamExpressionNode(arg)) {
          throw new Error();
        }
        loArgs.push(layoutLabeledItem(param.bind.name.text, layoutStreamExpressionNode(arg, ctx)));
        break;

      case NodeKind.FunctionParam:
        if (arg.kind !== NodeKind.FunctionDefinition) {
          throw new Error();
        }
        loArgs.push(layoutFunctionDefinitionNode(arg, ctx));
        break;

      default: {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const exhaustive: never = param; // this will cause a type error if we haven't handled all cases
        throw new Error();
      }
    }
  }

  const loArray = layoutArray(loArgs, false);

  const combinedReactNode = layoutReactNodes(([] as Array<React.ReactNode>).concat([<div className="TreeView-common-leaf">{funcIface.name.text}</div>], loArgs.map(item => item.reactNode)), loArray.size === undefined ? 'block' : 'inline');

  return {
    reactNode: <SelectableWrapper selId={node.nid} style="common" ctx={ctx}>{combinedReactNode}</SelectableWrapper>,
    size: loArray.size,
    seltree: {
      selId: node.nid,
      dir: loArray.size === undefined ? 'block' : 'inline',
      children: [loArray.seltree],
      flags: {},
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
      return layoutSimpleNode(node, '\xa0\xa0\xa0\xa0', '#faa', ctx);

    case NodeKind.NumberLiteral:
      return layoutSimpleNode(node, node.val.toString(), 'rgb(0, 92, 197)', ctx);

    case NodeKind.TextLiteral:
      return layoutSimpleNode(node, node.val, 'rgb(3, 47, 98)', ctx, [quotesIcon, 'text']);

    case NodeKind.BooleanLiteral:
      return layoutSimpleNode(node, node.val.toString(), 'rgb(0, 92, 197)', ctx, [booleanIcon, 'boolean']);

    case NodeKind.StreamReference:
      return layoutStreamReferenceNode(node, ctx);

    case NodeKind.Application:
      return layoutApplicationNode(node, ctx);

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

  switch (node.kind) {
    case NodeKind.StreamParam:
      loParamChild = layoutNameBindingNode(node.bind, ctx);
      break;

    case NodeKind.FunctionParam:
      loParamChild = layoutFunctionInterfaceNode(node.iface, ctx);
      break;

    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
      throw new Error();
    }
  }

  return {
    reactNode: <SelectableWrapper selId={node.nid} style="common" ctx={ctx}>{loParamChild.reactNode}</SelectableWrapper>,
    size: loParamChild.size,
    seltree: {
      selId: node.nid,
      dir: loParamChild.size === undefined ? 'block' : 'inline',
      children: [loParamChild.seltree],
      flags: {},
    },
  };
}

function layoutFunctionInterfaceNode(node: FunctionInterfaceNode, ctx: TreeViewContext): LayoutUnit {
  const loName = layoutTextNode(node.name, ctx);

  const loParams = node.params.map(n => layoutParamNode(n, ctx));
  const loParamsArray = layoutArray(loParams, true);

  // TODO: handle node.output when we can. maybe use →

  const loIfaceInner = layoutArray([loName, loParamsArray], false);

  return {
    ...loIfaceInner,
    reactNode: <div className="TreeView-func-padding">{loIfaceInner.reactNode}</div>,
  }
}

export function layoutStreamBindingNode(node: StreamBindingNode, ctx: TreeViewContext): LayoutUnit {
  const loBindingExpr = layoutBindingExpressionNode(node.bexpr, ctx);
  const loStreamExpr = layoutStreamExpressionNode(node.sexpr, ctx);

  const size = combineSizes([loBindingExpr.size, 1, loStreamExpr.size]);

  let reactNode: React.ReactNode;
  let seltree: SeltreeNode;

  if (size === undefined) {
    // block
    reactNode = (
      <SelectableWrapper selId={node.nid} style="common" ctx={ctx}>
        <div>
          <div>{loBindingExpr.reactNode} =</div>
          <div>{loStreamExpr.reactNode}</div>
        </div>
      </SelectableWrapper>
    );
    seltree = {
      selId: node.nid,
      dir: 'block',
      children: [loBindingExpr.seltree, loStreamExpr.seltree],
      flags: {},
    };
  } else {
    // inline
    reactNode = (
      <SelectableWrapper selId={node.nid} style="common" ctx={ctx}>
        <span>{loBindingExpr.reactNode} = {loStreamExpr.reactNode}</span>
      </SelectableWrapper>
    );
    seltree = {
      selId: node.nid,
      dir: 'block',
      children: [loBindingExpr.seltree, loStreamExpr.seltree],
      flags: {},
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
  } else if (node.kind === NodeKind.FunctionDefinition) {
    return layoutFunctionDefinitionNode(node, ctx);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
    throw new Error('unreachable');
  }
};

function layoutTreeImplNode(node: TreeImplNode, ctx: TreeViewContext): LayoutUnit {
  const items: Array<LayoutUnit> = [];

  for (const n of node.body) {
    items.push(layoutTreeImplBodyNode(n, ctx));
  }
  if (node.out) {
    const annoSexp = layoutStreamExpressionNode(node.out, ctx);

    items.push(layoutLabeledItem('←', annoSexp));
  }
  const loImplInner = layoutArray(items, true);

  return {
    ...loImplInner,
    reactNode: <div className="TreeView-func-padding">{loImplInner.reactNode}</div>,
  }
}

function layoutFunctionImplNode(node: FunctionImplNode, ctx: TreeViewContext): LayoutUnit {
  switch (node.kind) {
    case NodeKind.NativeImpl:
      throw new Error('unimplemented');

    case NodeKind.TreeImpl:
      return layoutTreeImplNode(node, ctx);

    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
      throw new Error();
    }
  }
}

export function layoutFunctionDefinitionNode(node: FunctionDefinitionNode, ctx: TreeViewContext): LayoutUnit {
  const loIface = layoutFunctionInterfaceNode(node.iface, ctx);
  const loImpl = layoutFunctionImplNode(node.impl, ctx);

  return {
    reactNode: <SelectableWrapper selId={node.nid} style="funcdef" ctx={ctx}>{layoutReactNodes([loIface.reactNode, loImpl.reactNode], 'block')}</SelectableWrapper>,
    size: undefined,
    seltree: {
      selId: node.nid,
      dir: 'block',
      children: [loIface.seltree, loImpl.seltree],
      flags: {},
    },
  };
};
