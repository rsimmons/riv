import React, { useState } from 'react';
import { Node, FunctionDefinitionNode, StreamExpressionNode, NodeKind, isStreamExpressionNode, StreamReferenceNode, ApplicationNode, FunctionInterfaceNode, NameBindingNode, ParamNode, StreamParamNode, TreeImplBodyNode, FunctionImplNode, TreeImplNode, BindingExpressionNode, StreamBindingNode, UID, TextNode } from '../compiler/Tree';
import './TreeView.css';
import { StaticEnvironment } from '../editor/EditorReducer';
// import { TemplateLayout, TextSegment, GroupEditable } from '../compiler/TemplateLayout';
import quotesIcon from './icons/quotes.svg';
import booleanIcon from './icons/boolean.svg';
// import { DynamicInterfaceEditAction, DynamicInterfaceChange } from '../compiler/FunctionInterface';

const BOUND_NAME_BOX_COLOR = 'rgb(111, 66, 193)';
const STREAM_REFERENCE_BOX_COLOR = '#1d8a3b';

export interface TreeViewContext {
  staticEnvMap: ReadonlyMap<Node, StaticEnvironment>;
  onSelectNodeId: (nid: UID) => void;
};

/*
interface UseSelectableResult {
  classes: ReadonlyArray<string>;
  handlers: {
    onClick?: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void,
    onMouseOver?: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void,
    onMouseOut?: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void,
    tabIndex?: number,
  };
}

function useSelectable(node: Node | undefined, ref: React.RefObject<HTMLDivElement>, ctx: TreeViewContext): UseSelectableResult {
  const [isHovered, setIsHovered] = useState(false);
  const isSelected = node && (ctx.markedNodes.selected === node);
  const isReferent = node && (ctx.markedNodes.referentName === node);

  useLayoutEffect(() => {
    if (ctx.focusSelected && isSelected && ref.current) {
      ref.current.focus();
    }
  });

  if (!node) {
    return {
      classes: [],
      handlers: {},
    };
  }

  const handleClick = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if ((e.target as Element).tagName !== 'INPUT') {
      e.stopPropagation();
      ctx.onSelectNode(node);
    }
  };

  const handleMouseOver = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    setIsHovered(true);
    e.stopPropagation();
  };

  const handleMouseOut = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    setIsHovered(false);
  };

  const classes: Array<string> = [];

  if (isSelected) {
    classes.push('TreeView-selected');
  }
  if (isReferent) {
    classes.push('TreeView-referent');
  }
  if (isHovered) {
    classes.push('TreeView-hovered');
  }
  // TODO: handle clipboard-top, clipboard-rest?

  return {
    classes,
    handlers: {
      onClick: handleClick,
      onMouseOver: handleMouseOver,
      onMouseOut: handleMouseOut,
      tabIndex: 0,
    }
  };
}
*/

function layoutNodes(nodes: ReadonlyArray<React.ReactNode>, dir: 'block' | 'inline'): React.ReactNode {
  return (
    <div className={'TreeView-layout-' + dir}>
      {nodes.map(node => (
        <div className={'TreeView-layout-' + dir + '-item'}>{node}</div>
      ))}
    </div>
  );
}

function indentNode(node: React.ReactNode): React.ReactNode {
  return <div className='TreeView-indent'>{node}</div>
}

interface MergeableAnnotations {
  readonly moveUp: ReadonlyArray<[UID, UID]>;
  readonly moveDown: ReadonlyArray<[UID, UID]>;
  readonly moveRight: ReadonlyArray<[UID, UID]>;
  readonly moveLeft: ReadonlyArray<[UID, UID]>;

  // canEdit?
  readonly canDelete: ReadonlyArray<UID>;
  readonly canInsertUp: ReadonlyArray<UID>;
  readonly canInsertDown: ReadonlyArray<UID>;
}

interface PortAnnotations {
  readonly enterTop: UID | undefined;
  readonly enterBottom: UID | undefined;
  readonly enterLeft: UID | undefined;
  readonly enterRight: UID | undefined;
  readonly exitTop: ReadonlyArray<UID>;
  readonly exitBottom: ReadonlyArray<UID>;
  readonly exitLeft: ReadonlyArray<UID>;
  readonly exitRight: ReadonlyArray<UID>;
}

interface Annotations extends MergeableAnnotations, PortAnnotations {
}

type Size = number | undefined;

interface AnnoReactNode {
  reactNode: React.ReactNode;
  size: Size; // undefined if block layout. approximate character length if inline layout.
  anno: Annotations;
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

function createEmptyPortAnnos(): PortAnnotations {
  return {
    enterTop: undefined,
    enterBottom: undefined,
    enterLeft: undefined,
    enterRight: undefined,
    exitTop: [],
    exitBottom: [],
    exitLeft: [],
    exitRight: [],
  };
}

function createEmptyAnnos(nid: UID): Annotations {
  return {
    moveUp: [],
    moveDown: [],
    moveLeft: [],
    moveRight: [],

    canDelete: [],
    canInsertUp: [],
    canInsertDown: [],

    ...createEmptyPortAnnos(),
  };
}

function flattenArrays<T>(arrs: ReadonlyArray<ReadonlyArray<T>>): ReadonlyArray<T> {
  return ([] as ReadonlyArray<T>).concat(...arrs);
}

function mergeAnnos(annos: ReadonlyArray<MergeableAnnotations>): MergeableAnnotations {
  return {
    moveUp: flattenArrays(annos.map(a => a.moveUp)),
    moveDown: flattenArrays(annos.map(a => a.moveDown)),
    moveLeft: flattenArrays(annos.map(a => a.moveLeft)),
    moveRight: flattenArrays(annos.map(a => a.moveRight)),

    canDelete: flattenArrays(annos.map(a => a.canDelete)),
    canInsertUp: flattenArrays(annos.map(a => a.canInsertUp)),
    canInsertDown: flattenArrays(annos.map(a => a.canInsertDown)),
  };
}

function annoLabel(text: string): AnnoReactNode {
  return {
    reactNode: text, // TODO: need this be wrapped in a div?
    size: text.length,
    anno: {
      moveUp: [],
      moveDown: [],
      moveLeft: [],
      moveRight: [],

      canDelete: [],
      canInsertUp: [],
      canInsertDown: [],

      enterTop: undefined,
      enterBottom: undefined,
      enterLeft: undefined,
      enterRight: undefined,
      exitTop: [],
      exitBottom: [],
      exitLeft: [],
      exitRight: [],
    },
  }
}

function annoLabeledItem(label: string, item: AnnoReactNode): AnnoReactNode {
  // TODO: Do we want to line-break if total size with label is too long?
  if (item.size === undefined) {
    return {
      reactNode: layoutNodes([
        label,
        indentNode(item.reactNode),
      ], 'block'),
      size: undefined,
      anno: item.anno,
    };
  } else {
    return {
      reactNode: layoutNodes([label, item.reactNode], 'inline'),
      size: item.size, // TODO: include label?
      anno: item.anno,
    };
  }
}

const SelectableWrapper: React.FC<{nid: UID, ctx: TreeViewContext}> = ({nid, ctx, children}) => {
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

  const classes: Array<string> = ['TreeView-selectable'];

  if (isHovered) {
    classes.push('TreeView-hovered');
  }

  return (
    <div data-nid={nid} className={classes.join(' ')} onClick={handleClick} onMouseOver={handleMouseOver} onMouseOut={handleMouseOut}>
      {children}
    </div>
  );
};

export function annoSelectable(node: AnnoReactNode, nid: UID, ctx: TreeViewContext): AnnoReactNode {
  let anno: Annotations;

  if (node.size === undefined) {
    // block
    anno = {
      ...node.anno,
      moveUp: node.anno.moveUp.concat(node.anno.exitTop.map(exit => [exit, nid])),
      moveLeft: node.anno.moveLeft.concat(node.anno.exitLeft.map(exit => [exit, nid])),
      moveRight: node.anno.enterLeft ? node.anno.moveRight.concat([[nid, node.anno.enterLeft]]) : node.anno.moveRight,
      enterTop: nid,
      enterBottom: nid,
      enterLeft: nid,
      enterRight: undefined,
      exitTop: [nid],
      exitBottom: node.anno.exitBottom.concat([nid]),
      exitLeft: [nid],
      exitRight: [],
    };
  } else {
    // inline
    anno = {
      ...node.anno,
      moveLeft: node.anno.moveLeft.concat(node.anno.exitLeft.map(exit => [exit, nid])),
      moveRight: node.anno.enterLeft ? node.anno.moveRight.concat([[nid, node.anno.enterLeft]]) : node.anno.moveRight,
      enterTop: nid,
      enterBottom: nid,
      enterLeft: nid,
      enterRight: node.anno.enterRight || nid,
      exitTop: node.anno.exitTop.concat([nid]),
      exitBottom: node.anno.exitBottom.concat([nid]),
      exitLeft: [nid],
      exitRight: node.anno.exitRight.length ? node.anno.exitRight : [nid],
    };
  }

  return {
    reactNode: <SelectableWrapper nid={nid} ctx={ctx}>{node.reactNode}</SelectableWrapper>,
    size: node.size,
    anno,
  };
}

function annoTextView(node: TextNode, ctx: TreeViewContext): AnnoReactNode {
  return annoSimpleNodeView(node, node.text || '\xa0\xa0\xa0\xa0', BOUND_NAME_BOX_COLOR, ctx);
}

const MAX_ROW_WIDTH = 30;

function annoArrayLayout(items: ReadonlyArray<AnnoReactNode>): AnnoReactNode {
  const size = combineSizes(items.map(item => item.size));

  const mergedChildAnnos = mergeAnnos(items.map(item => item.anno));

  // clone these to make local changes
  const moveUp = [...mergedChildAnnos.moveUp];
  const moveDown = [...mergedChildAnnos.moveDown];
  const moveLeft = [...mergedChildAnnos.moveLeft];
  const moveRight = [...mergedChildAnnos.moveRight];
  const canDelete = [...mergedChildAnnos.canDelete];
  const canInsertUp = [...mergedChildAnnos.canInsertUp];
  const canInsertDown = [...mergedChildAnnos.canInsertDown];

  let enterTop: UID | undefined;
  let enterBottom: UID | undefined;
  let enterLeft: UID | undefined;
  let enterRight: UID | undefined;
  let exitTop: ReadonlyArray<UID>;
  let exitBottom: ReadonlyArray<UID>;
  let exitLeft: ReadonlyArray<UID>;
  let exitRight: ReadonlyArray<UID>;

  let layoutDir: 'block' | 'inline';

  if (size === undefined) {
    // block/vertical
    if (items.length === 0) {
      // TODO: implement
      exitTop = [];
      exitBottom = [];
      exitLeft = [];
      exitRight = [];
    } else {
      enterTop = items[0].anno.enterTop;
      enterBottom = items[items.length-1].anno.enterBottom;
      enterLeft = items[0].anno.enterLeft;
      enterRight = undefined;
      exitTop = items[0].anno.exitTop;
      exitBottom = items[items.length-1].anno.exitBottom;
      exitLeft = flattenArrays(items.map(item => item.anno.exitLeft));
      exitRight = [];

      for (let i = 0; i < (items.length-1); i++) {
        // connect items i and i+1

        for (const exit of items[i].anno.exitBottom) {
          const entrance = items[i+1].anno.enterTop;
          if (!entrance) {
            throw new Error();
          }
          moveDown.push([exit, entrance]);
        }

        for (const exit of items[i+1].anno.exitTop) {
          const entrance = items[i].anno.enterBottom;
          if (!entrance) {
            throw new Error();
          }
          moveUp.push([exit, entrance]);
        }
      }
    }
    layoutDir = 'block';
  } else {
    // inline/horizontal
    if (items.length === 0) {
      // TODO: implement
      exitTop = [];
      exitBottom = [];
      exitLeft = [];
      exitRight = [];
    } else {
      enterTop = items[0].anno.enterTop;
      enterBottom = items[0].anno.enterTop;
      enterLeft = items[0].anno.enterLeft;
      enterRight = items[items.length-1].anno.enterRight;
      exitTop = flattenArrays(items.map(item => item.anno.exitTop));
      exitBottom = flattenArrays(items.map(item => item.anno.exitBottom))
      exitLeft = items[0].anno.exitLeft;
      exitRight = items[items.length-1].anno.exitRight;

      for (let i = 0; i < (items.length-1); i++) {
        // connect items i and i+1

        for (const exit of items[i].anno.exitRight) {
          const entrance = items[i+1].anno.enterLeft;
          if (!entrance) {
            throw new Error();
          }
          moveRight.push([exit, entrance]);
        }

        for (const exit of items[i+1].anno.exitLeft) {
          const entrance = items[i].anno.enterRight;
          if (!entrance) {
            throw new Error();
          }
          moveLeft.push([exit, entrance]);
        }
      }
    }
    layoutDir = 'inline';
  }

  return {
    reactNode: layoutNodes(items.map(item => item.reactNode), layoutDir),
    size,
    anno: {
      moveUp,
      moveDown,
      moveLeft,
      moveRight,

      canDelete,
      canInsertUp,
      canInsertDown,

      enterTop,
      enterBottom,
      enterLeft,
      enterRight,
      exitTop,
      exitBottom,
      exitLeft,
      exitRight,
    },
  }
}

function annoSimpleNodeView(treeNode: Node, content: string, bgColor: string, ctx: TreeViewContext, icon?: [string, string]): AnnoReactNode {
  return {
    reactNode: (
      <div className='TreeView-simple-leaf' style={{color: bgColor}}>
        {icon && <img className="TreeView-literal-icon" src={icon[0]} alt={icon[1]} />}
        {content}
      </div>
    ),
    size: content.length,
    anno: createEmptyAnnos(treeNode.nid),
  };
};



function annoStreamReferenceView(node: StreamReferenceNode, ctx: TreeViewContext): AnnoReactNode {
  const env = ctx.staticEnvMap.get(node);
  if (!env) {
    throw new Error();
  }
  const nameBinding = env.streamEnv.get(node.ref);
  if (!nameBinding) {
    throw new Error();
  }

  return annoSimpleNodeView(node, nameBinding.name.text || '\xa0\xa0\xa0\xa0', STREAM_REFERENCE_BOX_COLOR, ctx);
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

function annoApplicationView(node: ApplicationNode, ctx: TreeViewContext): AnnoReactNode {
  /*
  interface TreeAndAnnoNodes {
    readonly annoReactNode: AnnoReactNode;
    readonly treeNode?: Node; // we just use its identity for selection. may be undefined if not selectable
  }

  const templateToLogicalLayout = (template: TemplateLayout, nodeMap: ReadonlyMap<string, TreeAndAnnoNodes>): LogicalLayout => {
    const result: Array<LogicalGroup> = [];

    for (const group of template) {
      const newSegments: Array<LogicalSegment> = [];
      for (const segment of group.segments) {
        if (segment.kind === 'placeholder') {
          const nodes = nodeMap.get(segment.key);
          if (!nodes) {
            throw new Error();
          }
          newSegments.push({
            kind: 'nodes',
            treeNode: nodes.treeNode,
            annoReactNode: nodes.annoReactNode,
          });
        } else {
          newSegments.push(segment);
        }
      }

      result.push({
        ...group, // copies .editable
        segments: newSegments,
      });
    }

    return result;
  };
  */

  const env = ctx.staticEnvMap.get(node);
  if (!env) {
    throw new Error();
  }
  const funcIface = env.functionEnv.get(node.fid);
  if (!funcIface) {
    throw new Error();
  }

  const items: Array<AnnoReactNode> = [];

  // TODO: push funcIface.name as plain text?

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
        items.push(annoLabeledItem(param.bind.name.text, annoSelectable(annoStreamExpressionView(arg, ctx), arg.nid, ctx)));
        break;

      case NodeKind.FunctionParam:
        if (arg.kind !== NodeKind.FunctionDefinition) {
          throw new Error();
        }
        items.push(annoSelectable(annoFunctionDefinitionView(arg, ctx), arg.nid, ctx));
        break;

      default: {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const exhaustive: never = param; // this will cause a type error if we haven't handled all cases
        throw new Error();
      }
    }
  }

  return annoArrayLayout(items);

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

export function annoStreamExpressionView(node: StreamExpressionNode, ctx: TreeViewContext): AnnoReactNode {
  switch (node.kind) {
    case NodeKind.UndefinedLiteral:
      return annoSimpleNodeView(node, '\xa0\xa0\xa0\xa0', '#faa', ctx);

    case NodeKind.NumberLiteral:
      return annoSimpleNodeView(node, node.val.toString(), 'rgb(0, 92, 197)', ctx);

    case NodeKind.TextLiteral:
      return annoSimpleNodeView(node, node.val, 'rgb(3, 47, 98)', ctx, [quotesIcon, 'text']);

    case NodeKind.BooleanLiteral:
      return annoSimpleNodeView(node, node.val.toString(), 'rgb(0, 92, 197)', ctx, [booleanIcon, 'boolean']);

    case NodeKind.StreamReference:
      return annoStreamReferenceView(node, ctx);

    case NodeKind.Application:
      return annoApplicationView(node, ctx);

    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
      throw new Error();
    }
  }
}

function annoNameBindingView(node: NameBindingNode, ctx: TreeViewContext): AnnoReactNode {
  return annoTextView(node.name, ctx);
}

function annoBindingExpressionView(node: BindingExpressionNode, ctx: TreeViewContext): AnnoReactNode {
  switch (node.kind) {
    case NodeKind.NameBinding:
      return annoNameBindingView(node, ctx);

    default: {
      throw new Error();
    }
  }
}

function annoStreamParamView(node: StreamParamNode, ctx: TreeViewContext): AnnoReactNode {
  const annoNameBinding = annoNameBindingView(node.bind, ctx);

  return {
    reactNode: annoNameBinding.reactNode,
    size: annoNameBinding.size,
    anno: createEmptyAnnos(node.nid),
  };
}

function annoParamView(node: ParamNode, ctx: TreeViewContext): AnnoReactNode {
  switch (node.kind) {
    case NodeKind.StreamParam:
      return annoStreamParamView(node, ctx);

    case NodeKind.FunctionParam:
      return annoSelectable(annoFunctionInterfaceView(node.iface, ctx), node.iface.nid, ctx);

    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
      throw new Error();
    }
  }
}

function annoFunctionInterfaceView(node: FunctionInterfaceNode, ctx: TreeViewContext): AnnoReactNode {
  const items: Array<AnnoReactNode> = [];

  items.push(annoSelectable(annoTextView(node.name, ctx), node.name.nid, ctx));

  for (const n of node.params) {
    items.push(annoSelectable(annoParamView(n, ctx), n.nid, ctx));
  }

  // TODO: handle node.output when we can. maybe use →

  return annoArrayLayout(items);
}

export function annoStreamBindingView(node: StreamBindingNode, ctx: TreeViewContext): AnnoReactNode {
  const annoBindingExpr = annoBindingExpressionView(node.bexpr, ctx);
  const annoStreamExpr = annoSelectable(annoStreamExpressionView(node.sexpr, ctx), node.sexpr.nid, ctx);

  const size = combineSizes([annoBindingExpr.size, 1, annoStreamExpr.size]);

  let reactNode: React.ReactNode;

  const mergedChildAnnos = mergeAnnos([annoBindingExpr.anno, annoStreamExpr.anno]);
  const newMoveRight = [...mergedChildAnnos.moveRight];

  for (const exit of annoBindingExpr.anno.exitRight) {
    const entrance = annoStreamExpr.anno.enterLeft;
    if (!entrance) {
      throw new Error();
    }
    newMoveRight.push([exit, entrance]);
  }

  if (size === undefined) {
    // break
    reactNode = (
      <div>
        <div>{annoBindingExpr.reactNode} =</div>
        <div>{annoStreamExpr.reactNode}</div>
      </div>
    );
  } else {
    // one line
    reactNode = <span>{annoBindingExpr.reactNode} = {annoStreamExpr.reactNode}</span>
  }

  return {
    reactNode,
    size,
    anno: {
      ...mergedChildAnnos,
      moveRight: newMoveRight,
      ...createEmptyPortAnnos(),
    },
  };
}

function annoTreeImplBodyNodeView(node: TreeImplBodyNode, ctx: TreeViewContext): AnnoReactNode {
  if (isStreamExpressionNode(node)) {
    return annoStreamExpressionView(node, ctx);
  } else if (node.kind === NodeKind.StreamBinding) {
    return annoStreamBindingView(node, ctx);
  } else if (node.kind === NodeKind.FunctionDefinition) {
    return annoFunctionDefinitionView(node, ctx);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
    throw new Error('unreachable');
  }
};

function annoTreeImplView(node: TreeImplNode, ctx: TreeViewContext): AnnoReactNode {
  const items: Array<AnnoReactNode> = [];

  for (const n of node.body) {
    items.push(annoSelectable(annoTreeImplBodyNodeView(n, ctx), n.nid, ctx));
  }
  if (node.out) {
    const annoSexp = annoSelectable(annoStreamExpressionView(node.out, ctx), node.out.nid, ctx);

    items.push(annoLabeledItem('←', annoSexp));
  }
  return annoArrayLayout(items);
}

function annoFunctionImplView(node: FunctionImplNode, ctx: TreeViewContext): AnnoReactNode {
  switch (node.kind) {
    case NodeKind.NativeImpl:
      throw new Error('unimplemented');

    case NodeKind.TreeImpl:
      return annoTreeImplView(node, ctx);

    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
      throw new Error();
    }
  }
}

export function annoFunctionDefinitionView(node: FunctionDefinitionNode, ctx: TreeViewContext): AnnoReactNode {
  const annoIface = annoFunctionInterfaceView(node.iface, ctx);
  const annoImpl = annoFunctionImplView(node.impl, ctx);

  const mergedChildAnnos = mergeAnnos([annoIface.anno, annoImpl.anno]);
  const enterTop = annoImpl.anno.enterTop;
  const enterLeft = annoImpl.anno.enterLeft;
  const exitTop = annoImpl.anno.exitTop;
  const exitLeft = annoImpl.anno.exitLeft;

  return {
    reactNode: layoutNodes([annoIface.reactNode, annoImpl.reactNode], 'block'),
    size: undefined,
    anno: {
      ...mergedChildAnnos,
      ...createEmptyPortAnnos(),
      enterTop,
      enterLeft,
      exitTop,
      exitLeft,
    },
  };
};
