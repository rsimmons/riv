import React, { useState, useRef, useLayoutEffect } from 'react';
import { Node, FunctionDefinitionNode, StreamExpressionNode, BodyExpressionNode, NodeKind, isStreamExpressionNode, StreamReferenceNode, NameNode, ApplicationNode, ArrayLiteralNode, TreeFunctionDefinitionNode, isFunctionDefinitionNode } from './Tree';
import './TreeView.css';
import { StaticEnvironment, extendStaticEnv } from './EditReducer';
import { TextualSyntaxTemplate, parseTemplateString } from './TextualSyntaxTemplate';
import quotesIcon from './icons/quotes.svg';
import booleanIcon from './icons/boolean.svg';
import { parseStringTextualInterfaceSpec, TreeSignature, TreeSignatureYield } from './FunctionInterface';

const BOUND_NAME_BOX_COLOR = '#d1e6ff';
const STREAM_REFERENCE_BOX_COLOR = '#a1cdff';

interface MarkedNodes {
  selected: Node;
  referentName: Node | undefined;
}

export interface TreeViewContext {
  markedNodes: MarkedNodes;
  staticEnv: StaticEnvironment;
  setSelectedNode: (node: Node) => void;
  focusSelected: boolean;
};

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
      ctx.setSelectedNode(node);
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


interface SizedReactNode {
  singleLineWidth: number | undefined; // if undefined, that means it's multi-line. width only matters if single-line
  reactNode: React.ReactNode;
}

const SimpleNodeView: React.FC<{treeNode: Node, content: string, icon?: [string, string], bgColor: string, ctx: TreeViewContext}> = ({treeNode, content, icon, bgColor, ctx}) => {
  const ref = useRef<HTMLDivElement>(null);
  const {classes: selectionClasses, handlers: selectionHandlers} = useSelectable(treeNode, ref, ctx);
  return (
    <div ref={ref} className={selectionClasses.concat(['TreeView-node', 'TreeView-rounded-node', 'TreeView-simple-node']).join(' ')} {...selectionHandlers} style={{background: bgColor}}>{icon && <img className="TreeView-simple-node-icon" src={icon[0]} alt={icon[1]} /> }{content}</div>
  );
};

const sizedSimpleNodeView = ({treeNode, content, icon, bgColor, ctx}: {treeNode: Node, content: string, icon?: [string, string], bgColor: string, ctx: TreeViewContext}): SizedReactNode => {
  return {
    singleLineWidth: content.length,
    reactNode: <SimpleNodeView treeNode={treeNode} content={content} icon={icon} bgColor={bgColor} ctx={ctx} />,
  };
};

const objKeyWeakMap: WeakMap<object, number> = new WeakMap();
let nextKey = 0;
function objKey(obj: object): number {
  const key = objKeyWeakMap.get(obj);
  if (key) {
    return key;
  } else {
    const newKey = nextKey;
    nextKey++;
    objKeyWeakMap.set(obj, newKey);
    return newKey;
  }
}

interface TreeAndSizedNodes {
  sizedReactNode: SizedReactNode;
  treeNode?: Node; // we just use its identity for selection. may be undefined if not selectable
}

interface RowLayoutRow {
  indent: boolean;
  items: ReadonlyArray<string | TreeAndSizedNodes>;
}

type RowLayout = ReadonlyArray<RowLayoutRow>;

const RowView: React.FC<{selectionNode: Node | undefined, outwardNode: Node, layout: RowLayout, tightGrouping: boolean, ctx: TreeViewContext}> = ({selectionNode, outwardNode, layout, tightGrouping, ctx}) => {
  const ref = useRef<HTMLDivElement>(null);
  const {classes: selectionClasses, handlers: selectionHandlers} = useSelectable(selectionNode, ref, ctx);

  interface SelectionRecord {
    ref: React.RefObject<HTMLElement>,
    treeNode: Node,
  }

  const selectionRows: Array<ReadonlyArray<SelectionRecord>> = [];

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.getModifierState('Alt') ||
      e.getModifierState('Control') ||
      e.getModifierState('Meta') ||
      e.getModifierState('Shift')) {
      return;
    }
    if ((e.key === 'ArrowRight') && (ref.current === e.target)) {
      if (selectionRows.length > 0) {
        e.stopPropagation();
        ctx.setSelectedNode(selectionRows[0][0].treeNode);
      }
    } else if ((e.key === 'ArrowLeft') || (e.key === 'ArrowRight') || (e.key === 'ArrowUp') || (e.key === 'ArrowDown')) {
      let located = false;
      selectionRows.forEach((row, rowIdx) => {
        row.forEach((item, itemIdx) => {
          if (item.ref.current && item.ref.current.contains(e.target as HTMLElement)) {
            // The event came from this item, with itemIdx within rowIdx

            // Sanity check: there should be only one matching child
            if (located) {
              throw new Error();
            }
            located = true;

            if (e.key === 'ArrowLeft') {
              e.stopPropagation();
              if (itemIdx === 0) {
                ctx.setSelectedNode(outwardNode);
              } else {
                const newItemIdx = itemIdx - 1;
                ctx.setSelectedNode(selectionRows[rowIdx][newItemIdx].treeNode);
              }
            } else if (e.key === 'ArrowRight') {
              if (itemIdx < (row.length - 1)) {
                e.stopPropagation();
                const newItemIdx = itemIdx + 1;
                ctx.setSelectedNode(selectionRows[rowIdx][newItemIdx].treeNode);
              }
            } else if ((e.key === 'ArrowUp') && (rowIdx === 0)) {
              e.stopPropagation();
              ctx.setSelectedNode(outwardNode);
            } else if ((e.key === 'ArrowDown') && (rowIdx === (selectionRows.length - 1))) {
              // Ignore, maybe ancestor will handle
            } else if ((e.key === 'ArrowUp') || (e.key === 'ArrowDown')) {
              const newRowIdx = rowIdx + ((e.key === 'ArrowDown') ? 1 : -1);
              e.stopPropagation();
              ctx.setSelectedNode(selectionRows[newRowIdx][0].treeNode);
            }
          }
        });
      });
    }
  };

  return (
    <div ref={ref} className={selectionClasses.concat(['TreeView-row-view', 'TreeView-rounded-node', 'TreeView-node']).join(' ')} {...selectionHandlers} onKeyDown={onKeyDown}>
      {layout.map((row, rowIdx) => {
        const selectionRow: Array<SelectionRecord> = [];
        const itemElems: Array<React.ReactNode> = [];

        row.items.forEach((item, itemIdx) => {
          if (typeof item === 'string') {
            const key = itemIdx;
            itemElems.push(
              <div className="TreeView-row-view-plain-text" key={key}>{item}</div>
            );
          } else {
            const ref: React.RefObject<HTMLDivElement> = React.createRef();

            if (item.treeNode) {
              selectionRow.push({
                ref,
                treeNode: item.treeNode,
              });
            }

            const key = item.treeNode ? ('obj' + objKey(item.treeNode)) : itemIdx;

            itemElems.push(
              <div ref={ref} key={key}>{item.sizedReactNode.reactNode}</div>
            );
          }
        });

        if (selectionRow.length > 0) {
          selectionRows.push(selectionRow);
        }

        const classes = ['TreeView-row-view-row'];
        if (row.indent) {
          classes.push('TreeView-row-view-row-indented');
        }
        if (tightGrouping) {
          classes.push('TreeView-row-view-row-tight');
        } else {
          classes.push('TreeView-row-view-row-loose');
        }

        return (
          <div key={rowIdx} className={classes.join(' ')}>{itemElems}</div>
        );
      })}
    </div>
  );
}

const sizedRowView = ({selectionNode, outwardNode, layout, tightGrouping, ctx}: {selectionNode: Node | undefined, outwardNode: Node, layout: RowLayout, tightGrouping: boolean, ctx: TreeViewContext}): SizedReactNode => {
  // Determine size
  let singleLineWidth: number | undefined = undefined;
  if (layout.length === 1) {
    if (layout[0].indent) {
      throw new Error(); // I don't think this makes sense to be indented with one row?
    }

    singleLineWidth = 0;
    for (const item of layout[0].items) {
      if (typeof item === 'string') {
        if (singleLineWidth !== undefined) {
          singleLineWidth += item.length;
        }
      } else {
        if (item.sizedReactNode.singleLineWidth === undefined) {
          singleLineWidth = undefined;
        } else {
          if (singleLineWidth !== undefined) {
            singleLineWidth += item.sizedReactNode.singleLineWidth;
          }
        }
      }
    }
  }

  return {
    singleLineWidth,
    reactNode: <RowView selectionNode={selectionNode} outwardNode={outwardNode} layout={layout} tightGrouping={tightGrouping} ctx={ctx} />
  };
}

const sizedTemplateView = ({selectionNode, outwardNode, template, nodeMap, tightGrouping, ctx}: {selectionNode: Node, outwardNode: Node, template: TextualSyntaxTemplate, nodeMap: Map<string, TreeAndSizedNodes>, tightGrouping: boolean, ctx: TreeViewContext}): SizedReactNode => {
  const MAX_WIDTH = 30;

  const createLayout = (trySingleLine: boolean): [RowLayout, number | undefined] => {
    const layout: Array<RowLayoutRow> = [];
    let accumItems: Array<string | TreeAndSizedNodes> = [];
    let accumLength: number = 0;
    let totalWidth: number | undefined = 0; // this gets set to undefined if we determine that result is not single-line

    const emitAccumItems = () => {
      if (accumItems.length > 0) {
        layout.push({
          indent: false,
          items: accumItems,
        });
      }
      accumItems = [];
      accumLength = 0;
    };

    for (const segment of template) {
      if (segment.kind === 'wildcard') {
        const nodes = nodeMap.get(segment.key);
        if (!nodes) {
          throw new Error();
        }

        if ((nodes.sizedReactNode.singleLineWidth !== undefined) && ((accumLength + nodes.sizedReactNode.singleLineWidth) <= MAX_WIDTH)) {
          accumItems.push(nodes);
          accumLength += nodes.sizedReactNode.singleLineWidth;
          if (totalWidth !== undefined) {
            totalWidth += nodes.sizedReactNode.singleLineWidth;
          }
        } else {
          emitAccumItems();
          layout.push({
            indent: true,
            items: [nodes],
          });
          totalWidth = undefined;
        }
      } else if (segment.kind === 'linebreak') {
        if (!trySingleLine) {
          emitAccumItems();
          totalWidth = undefined;
        }
      } else if (segment.kind === 'text') {
        const ellipsis = (accumItems.length === 0) && (layout.length > 0);
        accumItems.push((ellipsis ? '…' : '') + segment.text);
        accumLength += segment.text.length;
        if (totalWidth !== undefined) {
          totalWidth += segment.text.length;
        }
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const exhaustive: never = segment; // this will cause a type error if we haven't handled all cases
        throw new Error();
      }
    }
    emitAccumItems();

    return [layout, totalWidth];
  }

  const [singleLayout, singleLineWidth] = createLayout(true);
  if ((singleLineWidth !== undefined) && (singleLineWidth <= MAX_WIDTH)) {
    return {
      singleLineWidth,
      reactNode: <RowView selectionNode={selectionNode} outwardNode={outwardNode} layout={singleLayout} tightGrouping={tightGrouping} ctx={ctx} />,
    };
  } else {
    const [multiLayout, ] = createLayout(false);
    return {
      singleLineWidth: undefined,
      reactNode: <RowView selectionNode={selectionNode} outwardNode={outwardNode} layout={multiLayout} tightGrouping={tightGrouping} ctx={ctx} />,
    };
  }
}

const sizedNameView = ({node, ctx}: {node: NameNode, ctx: TreeViewContext}): SizedReactNode => {
  return sizedSimpleNodeView({treeNode: node, content: node.text || '\xa0\xa0\xa0\xa0', bgColor: BOUND_NAME_BOX_COLOR, ctx});
};

const sizedStreamReferenceView = ({node, ctx}: {node: StreamReferenceNode, ctx: TreeViewContext}): SizedReactNode => {
  const streamDef = ctx.staticEnv.streamEnv.get(node.ref);
  if (!streamDef) {
    throw new Error();
  }

  return sizedSimpleNodeView({treeNode: node, content: streamDef.name || '\xa0\xa0\xa0\xa0', bgColor: STREAM_REFERENCE_BOX_COLOR, ctx});
};

const sizedArrayLiteralView = ({node, ctx}: {node: ArrayLiteralNode, ctx: TreeViewContext}): SizedReactNode => {
  const layout: Array<RowLayoutRow> = [];

  layout.push({
    indent: false,
    items: ['['],
  });

  for (const elem of node.elems) {
    layout.push({
      indent: true,
      items: [
        {
          treeNode: elem,
          sizedReactNode: sizedStreamExpressionView({node: elem, ctx}),
        },
      ],
    });
  }

  layout.push({
    indent: false,
    items: [']'],
  });

  return sizedRowView({selectionNode: node, outwardNode: node, layout, tightGrouping: false, ctx});
}

const sizedApplicationView = ({node, ctx}: {node: ApplicationNode, ctx: TreeViewContext}): SizedReactNode => {
  const funcDef = ctx.staticEnv.functionEnv.get(node.fid);
  if (!funcDef) {
    throw new Error();
  }

  const nodeMap: Map<string, TreeAndSizedNodes> = new Map();

  node.sargs.forEach((sarg, idx) => {
    nodeMap.set('s' + idx, {
      treeNode: sarg,
      sizedReactNode: sizedStreamExpressionView({node: sarg, ctx}),
    });
  });
  node.fargs.forEach((farg, idx) => {
    nodeMap.set('f' + idx, {
      treeNode: farg,
      sizedReactNode: sizedFunctionDefinitionView({node: farg, ctx}),
    });
  });
  node.outs.forEach((out, idx) => {
    if (out.name) {
      nodeMap.set('y' + idx, {
        treeNode: out.name,
        sizedReactNode: sizedNameView({node: out.name, ctx}),
      });
    }
  });

  switch (funcDef.iface.kind) {
    case 'strtext':
      const tifspec = parseStringTextualInterfaceSpec(funcDef.iface.spec);
      return sizedTemplateView({
        selectionNode: node,
        outwardNode: node,
        template: tifspec.tmpl,
        nodeMap,
        tightGrouping: true,
        ctx,
      });

    case 'dtext': {
      const tifspec = funcDef.iface.getIface(node.settings);
      return sizedTemplateView({
        selectionNode: node,
        outwardNode: node,
        template: tifspec.tmpl,
        nodeMap,
        tightGrouping: true,
        ctx,
      });
    }

    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exhaustive: never = funcDef.iface; // this will cause a type error if we haven't handled all cases
      throw new Error();
    }
  }
};

const sizedStreamExpressionView = ({node, ctx}: {node: StreamExpressionNode, ctx: TreeViewContext}): SizedReactNode => {
  switch (node.kind) {
    case NodeKind.UndefinedLiteral:
      return sizedSimpleNodeView({treeNode: node, content: '\xa0\xa0\xa0\xa0', bgColor: '#faa', ctx});

    case NodeKind.NumberLiteral:
      return sizedSimpleNodeView({treeNode: node, content: node.val.toString(), bgColor: '#cce8cc', ctx});

    case NodeKind.TextLiteral:
      return sizedSimpleNodeView({treeNode: node, content: node.val, icon: [quotesIcon, 'text'], bgColor: '#fff3b9', ctx});

    case NodeKind.BooleanLiteral:
      return sizedSimpleNodeView({treeNode: node, content: node.val.toString(), icon: [booleanIcon, 'boolean'], bgColor: '#f0d4ff', ctx});

    case NodeKind.ArrayLiteral:
      return sizedArrayLiteralView({node, ctx});

    case NodeKind.StreamReference:
      return sizedStreamReferenceView({node, ctx});

    case NodeKind.Application:
      return sizedApplicationView({node, ctx});

    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
      throw new Error();
    }
  }
}

export const StreamExpressionView: React.FC<{node: StreamExpressionNode, ctx: TreeViewContext}> = ({ node, ctx }) => {
  const {reactNode} = sizedStreamExpressionView({node, ctx});
  return <>{reactNode}</> // empty angle brackets are to make types work
}

const sizedBodyExpressionView = ({node, sigYields, ctx}: {node: BodyExpressionNode, sigYields: ReadonlyArray<TreeSignatureYield>, ctx: TreeViewContext}): SizedReactNode => {
  if (isStreamExpressionNode(node)) {
    return sizedStreamExpressionView({node, ctx});
  } else if (isFunctionDefinitionNode(node)) {
    return sizedFunctionDefinitionView({node, ctx});
  } else if (node.kind === NodeKind.YieldExpression) {
    const displayedName = sigYields[node.idx].name === undefined ? node.idx.toString() : sigYields[node.idx].name;
    return sizedTemplateView({
      selectionNode: node,
      outwardNode: node,
      template: parseTemplateString(displayedName + ' ← $expr'),
      nodeMap: new Map([
        // ['name', {
        //   treeNode: node.name,
        //   sizedReactNode: sizedNameView({node: node.name, ctx}),
        // }],
        ['expr', {
          treeNode: node.expr,
          sizedReactNode: sizedStreamExpressionView({node: node.expr, ctx}),
        }],
      ]),
      tightGrouping: true,
      ctx,
    });
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
    throw new Error('unreachable');
  }
};

export const TreeFunctionDefinitionView: React.FC<{node: TreeFunctionDefinitionNode, ctx: TreeViewContext}> = ({ node, ctx }) => {
  const layout: Array<RowLayoutRow> = [];

  const newCtx: TreeViewContext = {
    ...ctx,
    staticEnv: extendStaticEnv(ctx.staticEnv, node),
  };

  let ifaceReactNode: React.ReactNode;
  let treeSig: TreeSignature;
  switch (node.iface.kind) {
    case 'strtext':
      treeSig = parseStringTextualInterfaceSpec(node.iface.spec).treeSig;
      ifaceReactNode = (
        <div>ƒ {node.iface.spec}</div>
      );
      break;

    case 'dtext':
      throw new Error('unsupported');

    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exhaustive: never = node.iface; // this will cause a type error if we haven't handled all cases
      throw new Error('unreachable');
    }
  }

  for (const bodyExpr of node.bodyExprs) {
    layout.push({
      indent: false,
      items: [
        {
          treeNode: bodyExpr,
          sizedReactNode: sizedBodyExpressionView({node: bodyExpr, sigYields: treeSig.yields, ctx: newCtx}),
        },
      ],
    });
  }

  const {reactNode: bodyReactNode} = sizedRowView({
    selectionNode: undefined,
    outwardNode: node,
    layout,
    tightGrouping: false,
    ctx: newCtx,
  });

  const ref = useRef<HTMLDivElement>(null);
  const {classes: selectionClasses, handlers: selectionHandlers} = useSelectable(node, ref, ctx);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.getModifierState('Alt') ||
      e.getModifierState('Control') ||
      e.getModifierState('Meta') ||
      e.getModifierState('Shift')) {
      return;
    }
    if ((e.key === 'ArrowRight') && (ref.current === e.target)) {
      if (node.bodyExprs.length > 0) {
        e.stopPropagation();
        ctx.setSelectedNode(node.bodyExprs[0]);
      }
    }
  };

  return (
    <div ref={ref} className={selectionClasses.concat(['TreeView-node', 'TreeView-tree-function-definition']).join(' ')} {...selectionHandlers} onKeyDown={onKeyDown}>
      <div className="TreeView-tree-function-definition-iface-spec">{ifaceReactNode}</div>
      <div className="TreeView-tree-function-definition-body">{bodyReactNode}</div>
    </div>
  );
}

export const FunctionDefinitionView: React.FC<{node: FunctionDefinitionNode, ctx: TreeViewContext}> = ({ node, ctx }) => {
  if (node.kind === NodeKind.TreeFunctionDefinition) {
    return <TreeFunctionDefinitionView node={node} ctx={ctx} />;
  } else if (node.kind === NodeKind.NativeFunctionDefinition) {
    throw new Error('unimplemented');
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
    throw new Error('unreachable');
  }
}

const sizedFunctionDefinitionView = ({node, ctx}: {node: FunctionDefinitionNode, ctx: TreeViewContext}): SizedReactNode => {
  return {
    singleLineWidth: undefined,
    reactNode: <FunctionDefinitionView node={node} ctx={ctx} />,
  };
};
