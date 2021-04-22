import React, { useState } from 'react';
import { Node, FunctionDefinitionNode, StreamExpressionNode, NodeKind, isStreamExpressionNode, StreamReferenceNode, ApplicationNode, FunctionInterfaceNode, NameBindingNode, ParamNode, TreeImplBodyNode, FunctionImplNode, TreeImplNode, BindingExpressionNode, StreamBindingNode, UID, TextNode } from '../compiler/Tree';
import './TreeView.css';
import { StaticEnvironment } from '../editor/EditorReducer';
// import { TemplateLayout, TextSegment, GroupEditable } from '../compiler/TemplateLayout';
import quotesIcon from './icons/quotes.svg';
import booleanIcon from './icons/boolean.svg';
import { SeltreeNode } from './Seltree';
import { parseTemplateString } from './FITemplate';

export interface TreeViewContext {
  staticEnvMap: ReadonlyMap<Node, StaticEnvironment>;
  onSelectNodeId: (nid: UID) => void;
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

function layoutLabeledStructure(struct: LabeledStructure): LayoutUnit {
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
  }));

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
      flags: {},
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

const MAX_ROW_WIDTH = 50;

function layoutArray(items: ReadonlyArray<LayoutUnit>, dyn: boolean, forceBlock: boolean): LayoutUnit {
  const size = combineSizes(items.map(item => item.size));

  const layoutDir = forceBlock ? 'block' : ((size === undefined) ? 'block' : 'inline');

  return {
    reactNode: (
      <div className={'TreeView-array-' + layoutDir}>
        {items.map(item => (
          <div className={'TreeView-array-' + layoutDir + '-item'}>{item.reactNode}</div>
        ))}
      </div>
    ),
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
      flags: undef ? {undef: true} : {},
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

  return layoutSimpleNode(node, nameBinding.name.text || '\xa0\xa0\xa0\xa0', 'streamref', ctx);
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

        let loNode: LayoutUnit;
        if (param.kind === NodeKind.StreamParam) {
          if (!isStreamExpressionNode(arg)) {
            throw new Error();
          }
          loNode = layoutStreamExpressionNode(arg, ctx);
        } else if (param.kind === NodeKind.FunctionParam) {
          if (arg.kind !== NodeKind.FunctionDefinition) {
            throw new Error();
          }
          loNode = layoutFunctionDefinitionNode(arg, ctx);
        } else {
          throw new Error();
        }

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

      switch (param.kind) {
        case NodeKind.StreamParam:
          if (!isStreamExpressionNode(arg)) {
            throw new Error();
          }
          lsItems.push({
            kind: 'node',
            preLabel: param.bind.name.text,
            postLabel: '',
            node: layoutStreamExpressionNode(arg, ctx),
          });
          break;

        case NodeKind.FunctionParam:
          if (arg.kind !== NodeKind.FunctionDefinition) {
            throw new Error();
          }
          lsItems.push({
            kind: 'node',
            preLabel: '',
            postLabel: '',
            node: layoutFunctionDefinitionNode(arg, ctx),
          });
          break;

        default: {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const exhaustive: never = param; // this will cause a type error if we haven't handled all cases
          throw new Error();
        }
      }
    }
  }

  const loStructure = layoutLabeledStructure(lsItems);

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
    reactNode: <SelectableWrapper key={node.nid} selId={node.nid} styling="common" ctx={ctx}>{loParamChild.reactNode}</SelectableWrapper>,
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
  const loParamsArray = layoutArray(loParams, true, false);

  // TODO: handle node.output when we can. maybe use →

  // We avoid creating an empty params seltree for now, until we do the thing where we have a dummy node
  const loIfaceInner = layoutArray([loName].concat(loParamsArray.seltree.children.length ? [loParamsArray] : []), false, false);

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
      flags: {},
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

function layoutTreeImplNode(node: TreeImplNode, forceBlock: boolean, ctx: TreeViewContext): LayoutUnit {
  const items: Array<LayoutUnit> = [];

  for (const n of node.body) {
    items.push(layoutTreeImplBodyNode(n, ctx));
  }
  if (node.out) {
    const annoSexp = layoutStreamExpressionNode(node.out, ctx);

    items.push(layoutLabeledStructure([
      {kind: 'text', text: '←'},
      {
        kind: 'node',
        preLabel: '',
        postLabel: '',
        node: annoSexp,
      },
    ]));
  }
  const loImplInner = layoutArray(items, true, forceBlock);

  return {
    ...loImplInner,
    reactNode: <div className="TreeView-func-padding">{loImplInner.reactNode}</div>,
  }
}

function layoutFunctionImplNode(node: FunctionImplNode, forceBlock: boolean, ctx: TreeViewContext): LayoutUnit {
  switch (node.kind) {
    case NodeKind.NativeImpl:
      throw new Error('unimplemented');

    case NodeKind.TreeImpl:
      return layoutTreeImplNode(node, forceBlock, ctx);

    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
      throw new Error();
    }
  }
}

export function layoutFunctionDefinitionNode(node: FunctionDefinitionNode, ctx: TreeViewContext): LayoutUnit {
  const loIface = layoutFunctionInterfaceNode(node.iface, ctx);
  const loImpl = layoutFunctionImplNode(node.impl, true, ctx);

  return {
    reactNode: (
      <SelectableWrapper key={node.nid} selId={node.nid} styling="funcdef" ctx={ctx}>
        <div className="TreeView-funcdef">
          <div className="TreeView-funcdef-iface">{loIface.reactNode}</div>
          <div className="TreeView-funcdef-impl">{loImpl.reactNode}</div>
        </div>
      </SelectableWrapper>
    ),
    size: undefined,
    seltree: {
      selId: node.nid,
      dir: 'block',
      children: [loIface.seltree, loImpl.seltree],
      flags: {},
    },
  };
};

export function layoutAnyNode(node: Node, ctx: TreeViewContext): LayoutUnit {
  if (isStreamExpressionNode(node)) {
    return layoutStreamExpressionNode(node, ctx);
  } else if (node.kind === NodeKind.FunctionDefinition) {
    return layoutFunctionDefinitionNode(node, ctx);
  } else {
    throw new Error();
  }
}
