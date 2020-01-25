import React, { useState, useRef, useLayoutEffect } from 'react';
import { Node, FunctionDefinitionNode, TreeFunctionDefinitionNode, StreamExpressionNode, BodyExpressionNode, NodeKind, isStreamExpressionNode, isFunctionExpressionNode, FunctionExpressionNode, isFunctionDefinitionNode, StreamReferenceNode, NameNode, ApplicationNode } from './Tree';
import './TreeView.css';
import { EnvironmentLookups } from './EditReducer';

const BOUND_NAME_BOX_COLOR = '#d1e6ff';
const STREAM_REFERENCE_BOX_COLOR = '#a1cdff';

function getFunctionNodeFromRef(funcRef: FunctionExpressionNode, envLookups: EnvironmentLookups): FunctionDefinitionNode {
  if (funcRef.kind !== NodeKind.FunctionReference) {
    throw new Error();
  }

  const nearestDef = envLookups.nodeToNearestTreeDef.get(funcRef);
  if (!nearestDef) {
    throw new Error();
  }

  const nodeFunctionEnv = envLookups.treeDefToFunctionEnv.get(nearestDef);
  if (!nodeFunctionEnv) {
    throw new Error();
  }

  const functionNode = nodeFunctionEnv.get(funcRef.ref);
  if (!functionNode) {
    throw new Error();
  }

  return functionNode;
}

interface MarkedNodes {
  selected: Node;
  referent: Node | undefined;
}

export interface TreeViewContext {
  markedNodes: MarkedNodes;
  envLookups: EnvironmentLookups;
  setSelectedNode: (node: Node) => void;
  focusSelected: boolean;
};

interface UseSelectableResult {
  classes: ReadonlyArray<string>;
  handlers: {
    onClick: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void,
    onMouseOver: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void,
    onMouseOut: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void,
    tabIndex: number,
  };
}

function useSelectable(node: Node, ref: React.RefObject<HTMLDivElement>, ctx: TreeViewContext): UseSelectableResult {
  const [hovered, setHovered] = useState(false);

  const handleClick = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if ((e.target as Element).tagName !== 'INPUT') {
      e.stopPropagation();
      ctx.setSelectedNode(node);
    }
  };

  const handleMouseOver = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    setHovered(true);
    e.stopPropagation();
  };

  const handleMouseOut = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    setHovered(false);
  };

  const classes: Array<string> = [];

  const selected = (ctx.markedNodes.selected === node);
  const referent = (ctx.markedNodes.referent === node);
  if (selected) {
    classes.push('TreeView-selected');
  }
  if (referent) {
    classes.push('TreeView-referent');
  }
  if (hovered) {
    classes.push('TreeView-hovered');
  }
  // TODO: handle clipboard-top, clipboard-rest?

  useLayoutEffect(() => {
    if (ctx.focusSelected && selected && ref.current) {
      ref.current.focus();
    }
  });

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

const SimpleNodeView: React.FC<{treeNode: Node, content: string, bgColor: string, ctx: TreeViewContext}> = ({treeNode, content, bgColor, ctx}) => {
  const ref = useRef<HTMLDivElement>(null);
  const {classes: selectionClasses, handlers: selectionHandlers} = useSelectable(treeNode, ref, ctx);
  return (
    <div ref={ref} className={selectionClasses.concat(['TreeView-node']).join(' ')} {...selectionHandlers} style={{background: bgColor}}>{content}</div>
  );
};

const sizedSimpleNodeView = ({treeNode, content, bgColor, ctx}: {treeNode: Node, content: string, bgColor: string, ctx: TreeViewContext}): SizedReactNode => {
  return {
    singleLineWidth: content.length,
    reactNode: <SimpleNodeView treeNode={treeNode} content={content} bgColor={bgColor} ctx={ctx} />,
  };
};

interface TreeAndSizedNodes {
  sizedReactNode: SizedReactNode;
  treeNode?: Node; // we just use its identity for selection. may be undefined if not selectable
}

interface RowLayoutRow {
  indent: boolean;
  items: ReadonlyArray<string | TreeAndSizedNodes>;
}

type RowLayout = ReadonlyArray<RowLayoutRow>;

const RowView: React.FC<{node: Node, layout: RowLayout, groupingLines: boolean, ctx: TreeViewContext}> = ({node, layout, groupingLines, ctx}) => {
  const ref = useRef<HTMLDivElement>(null);
  const {classes: selectionClasses, handlers: selectionHandlers} = useSelectable(node, ref, ctx);

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
                ctx.setSelectedNode(node);
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
              ctx.setSelectedNode(node);
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
    <div ref={ref} className={selectionClasses.concat(['TreeView-row-view TreeView-node']).join(' ')} {...selectionHandlers} onKeyDown={onKeyDown}>
      {layout.map((row, rowIdx) => {
        const selectionRow: Array<SelectionRecord> = [];
        const itemElems: Array<React.ReactNode> = [];

        for (const item of row.items) {
          if (typeof item === 'string') {
            itemElems.push(
              <div>{item}</div>
            );
          } else {
            const ref: React.RefObject<HTMLDivElement> = React.createRef();

            if (item.treeNode) {
              selectionRow.push({
                ref,
                treeNode: item.treeNode,
              });
            }

            itemElems.push(
              <div ref={ref}>{item.sizedReactNode.reactNode}</div>
            );
          }
        }

        if (selectionRow.length > 0) {
          selectionRows.push(selectionRow);
        }

        const classes = ['TreeView-row-view-row'];
        if (row.indent) {
          if (groupingLines && (rowIdx < (layout.length-1))) {
            classes.push('TreeView-row-view-row-indented-with-line');
          } else {
            classes.push('TreeView-row-view-row-indented-without-line');
          }
        }

        return (
          <div className={classes.join(' ')}>{itemElems}</div>
        );
      })}
    </div>
  );
}

const sizedRowView = ({node, layout, groupingLines, ctx}: {node: Node, layout: RowLayout, groupingLines: boolean, ctx: TreeViewContext}): SizedReactNode => {
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
    reactNode: <RowView node={node} layout={layout} groupingLines={groupingLines} ctx={ctx} />
  };
}

const sizedTemplateView = ({node, template, nodeMap, groupingLines, ctx}: {node: Node, template: string, nodeMap: Map<string, TreeAndSizedNodes>, groupingLines: boolean, ctx: TreeViewContext}): SizedReactNode => {
  const MAX_WIDTH = 30;

  const createLayout = (trySingleLine: boolean): [RowLayout, number | undefined] => {
    const splits = template.split(/(\$[a-z0-9]+|\|)/).map(s => s.trim()).filter(s => s);

    const layout: Array<RowLayoutRow> = [];
    let accumItems: Array<string | TreeAndSizedNodes> = [];
    let totalWidth: number | undefined = 0; // this gets set to undefined if we determine that result is not single-line

    const emitAccumItems = () => {
      if (accumItems.length > 0) {
        layout.push({
          indent: false,
          items: accumItems,
        });
      }
      accumItems = [];
    };

    for (const split of splits) {
      if (split.startsWith('$')) {
        const key = split.substr(1);
        const nodes = nodeMap.get(key);
        if (!nodes) {
          throw new Error();
        }

        if (nodes.sizedReactNode.singleLineWidth !== undefined) {
          // single-line node
          // TODO: if !trySingleLine, need to check if this will make the row too long
          accumItems.push(nodes);
          if (totalWidth !== undefined) {
            totalWidth += nodes.sizedReactNode.singleLineWidth;
          }
        } else {
          // not single-line node
          emitAccumItems();
          layout.push({
            indent: true,
            items: [nodes],
          });
          totalWidth = undefined;
        }
      } else if (split === '|') {
        if (!trySingleLine) {
          emitAccumItems();
          totalWidth = undefined;
        }
      } else {
        accumItems.push(split);
        if (totalWidth !== undefined) {
          totalWidth += split.length;
        }
      }
    }
    emitAccumItems();

    return [layout, totalWidth];
  }

  const [singleLayout, singleLineWidth] = createLayout(true);
  if ((singleLineWidth !== undefined) && (singleLineWidth <= MAX_WIDTH)) {
    return {
      singleLineWidth,
      reactNode: <RowView node={node} layout={singleLayout} groupingLines={groupingLines} ctx={ctx} />,
    };
  } else {
    const [multiLayout, ] = createLayout(false);
    return {
      singleLineWidth: undefined,
      reactNode: <RowView node={node} layout={multiLayout} groupingLines={groupingLines} ctx={ctx} />,
    };
  }
}

const sizedNameView = ({node, ctx}: {node: NameNode, ctx: TreeViewContext}): SizedReactNode => {
  return sizedSimpleNodeView({treeNode: node, content: node.text || '\xa0\xa0\xa0\xa0\xa0\xa0', bgColor: BOUND_NAME_BOX_COLOR, ctx});
};

const sizedStreamReferenceView = ({node, ctx}: {node: StreamReferenceNode, ctx: TreeViewContext}): SizedReactNode => {
  const nearestDef = ctx.envLookups.nodeToNearestTreeDef.get(node);
  if (!nearestDef) {
    throw new Error();
  }
  const nodeStreamEnv = ctx.envLookups.treeDefToStreamEnv.get(nearestDef);
  if (!nodeStreamEnv) {
    throw new Error();
  }
  const streamDef = nodeStreamEnv.get(node.ref);
  if (!streamDef) {
    throw new Error();
  }

  return sizedSimpleNodeView({treeNode: node, content: streamDef.name.text || '\xa0\xa0\xa0\xa0\xa0\xa0', bgColor: STREAM_REFERENCE_BOX_COLOR, ctx});
};

const sizedApplicationView = ({node, ctx}: {node: ApplicationNode, ctx: TreeViewContext}): SizedReactNode => {
  if (node.func.kind !== NodeKind.FunctionReference) {
    throw new Error('unimplemented');
  }

  const functionNode = getFunctionNodeFromRef(node.func, ctx.envLookups);

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
      sizedReactNode: sizedFunctionExpressionView({node: farg, ctx}),
    });
  });
  node.outs.forEach((out, idx) => {
    if (out.name) {
      nodeMap.set('o' + idx, {
        treeNode: out.name,
        sizedReactNode: sizedNameView({node: out.name, ctx}),
      });
    }
  });

  return sizedTemplateView({
    node,
    template: functionNode.format || ('need format for ' + functionNode.fid),
    nodeMap,
    groupingLines: true,
    ctx,
  });
};

const sizedStreamExpressionView = ({node, ctx}: {node: StreamExpressionNode, ctx: TreeViewContext}): SizedReactNode => {
  switch (node.kind) {
    case NodeKind.UndefinedLiteral:
      return sizedSimpleNodeView({treeNode: node, content: '\xa0\xa0\xa0\xa0\xa0\xa0', bgColor: 'red', ctx});

    case NodeKind.NumberLiteral:
      return sizedSimpleNodeView({treeNode: node, content: node.val.toString(), bgColor: '#cce8cc', ctx});

    case NodeKind.TextLiteral:
      return sizedSimpleNodeView({treeNode: node, content: node.val, bgColor: '#cce8cc', ctx});

    case NodeKind.BooleanLiteral:
      return sizedSimpleNodeView({treeNode: node, content: node.val.toString(), bgColor: '#cce8cc', ctx});

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

const sizedBodyExpressionView = ({node, ctx}: {node: BodyExpressionNode, ctx: TreeViewContext}): SizedReactNode => {
  if (isStreamExpressionNode(node)) {
    return sizedStreamExpressionView({node, ctx});
  } else if (isFunctionExpressionNode(node)) {
    throw new Error('unimplemented');
  } else if (node.kind === NodeKind.YieldExpression) {
    return sizedTemplateView({
      node,
      template: '$name ← $expr',
      nodeMap: new Map([
        ['name', {
          treeNode: node.name,
          sizedReactNode: sizedNameView({node: node.name, ctx}),
        }],
        ['expr', {
          treeNode: node.expr,
          sizedReactNode: sizedStreamExpressionView({node: node.expr, ctx}),
        }],
      ]),
      groupingLines: true,
      ctx,
    });
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
    throw new Error('unreachable');
  }
};

const sizedTreeFunctionDefinitionView = ({node, ctx}: {node: TreeFunctionDefinitionNode, ctx: TreeViewContext}): SizedReactNode => {
  const layout: Array<RowLayoutRow> = [];

  if ((node.sparams.length > 0) || (node.fparams.length > 0)) {
    // Some parameters
    layout.push({indent: false, items: [
      'given',
    ]});

    node.sparams.forEach(sparam => {
      layout.push({
        indent: true,
        items: [{
          treeNode: sparam.name,
          sizedReactNode: sizedNameView({node: sparam.name, ctx}),
        }],
      });
    });

    node.fparams.forEach(fparam => {
      layout.push({
        indent: true,
        items: [{
          treeNode: fparam.name,
          sizedReactNode: sizedNameView({node: fparam.name, ctx}),
        }],
      });
    });
  }

  for (const bodyExpr of node.body.exprs) {
    layout.push({
      indent: false,
      items: [
        {
          treeNode: bodyExpr,
          sizedReactNode: sizedBodyExpressionView({node: bodyExpr, ctx}),
        },
      ],
    });
  }

  const {singleLineWidth, reactNode} = sizedRowView({node, layout, groupingLines: false, ctx});
  return {
    singleLineWidth,
    reactNode: (
      <div className="TreeView-tree-function-definition-inner">{reactNode}</div>
    ),
  };
};

const sizedFunctionDefinitionView = ({node, ctx}: {node: FunctionDefinitionNode, ctx: TreeViewContext}): SizedReactNode => {
  if (node.kind === NodeKind.TreeFunctionDefinition) {
    return sizedTreeFunctionDefinitionView({node, ctx});
  } else if (node.kind === NodeKind.NativeFunctionDefinition) {
    throw new Error('unimplemented');
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
    throw new Error('unreachable');
  }
};

const sizedFunctionExpressionView = ({node, ctx}: {node: FunctionExpressionNode, ctx: TreeViewContext}): SizedReactNode => {
  if (node.kind === NodeKind.FunctionReference) {
    throw new Error('unimplemented');
  } else if (isFunctionDefinitionNode(node)) {
    return sizedFunctionDefinitionView({node, ctx});
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
    throw new Error('unreachable');
  }
};

export const TreeFunctionDefinitionView: React.FC<{node: TreeFunctionDefinitionNode, ctx: TreeViewContext}> = ({ node, ctx }) => {
  const {reactNode} = sizedTreeFunctionDefinitionView({node, ctx});
  return <>{reactNode}</> // empty angle brackets are to make types work
}
