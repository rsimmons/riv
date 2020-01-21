import React, { useState, useRef, useLayoutEffect } from 'react';
import { Node, FunctionDefinitionNode, TreeFunctionDefinitionNode, StreamExpressionNode, BodyExpressionNode, NodeKind, isStreamExpressionNode, isFunctionExpressionNode, FunctionExpressionNode, isFunctionDefinitionNode, StreamReferenceNode, NameNode, ApplicationNode } from './Tree';
import ExpressionChooser from './ExpressionChooser';
import './TreeView.css';
import { EnvironmentLookups, StreamDefinition } from './EditReducer';

const BOUND_NAME_BOX_COLOR = '#d1e6ff';
const STREAM_REFERENCE_BOX_COLOR = '#a1cdff';

function getFunctionNodeAndDisplayName(funcRef: FunctionExpressionNode, envLookups: EnvironmentLookups): [FunctionDefinitionNode, string] {
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

  const displayName = functionNode.name ? functionNode.name.text : ('<function ' + funcRef.ref + '>');

  return [functionNode, displayName];
}

export function formatStreamDefinition(sdef: StreamDefinition, envLookups: EnvironmentLookups): [string, React.ReactNode] {
  if (sdef.name) {
    return [sdef.name, <span>{sdef.name}</span>];
  } else {
    let s: string;
    switch (sdef.kind) {
      case 'expr':
        switch (sdef.expr.kind) {
          case NodeKind.UndefinedLiteral:
            s = '(undefined)';
            break;

          case NodeKind.NumberLiteral:
            s = '(' + sdef.expr.val.toString() + ')';
            break;

          case NodeKind.TextLiteral:
            s = '("' + sdef.expr.val + '")';
            break;

          case NodeKind.BooleanLiteral:
            s = '(' + sdef.expr.val.toString() + ')';
            break;

          case NodeKind.StreamReference:
            throw new Error(); // not possible?

          case NodeKind.Application: {
            const [funcDef, fname] = getFunctionNodeAndDisplayName(sdef.expr.func, envLookups);
            s = fname;
            if ((sdef.yieldIdx !== undefined) && !((funcDef.sig.yields.length === 1) && !funcDef.sig.yields[0].name)) {
              let yieldDisplayStr: string;

              const yieldNameNode = funcDef.sig.yields[sdef.yieldIdx].name;
              if (yieldNameNode) {
                yieldDisplayStr = yieldNameNode.text;
              } else {
                yieldDisplayStr = sdef.yieldIdx.toString();
              }
              s += '.' + yieldDisplayStr;
            }
            break;
          }

          default: {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const exhaustive: never = sdef.expr; // this will cause a type error if we haven't handled all cases
            throw new Error();
          }
        }
        break;

      case 'param':
        s = sdef.sid;
        break;

      default: {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const exhaustive: never = sdef; // this will cause a type error if we haven't handled all cases
        throw new Error();
      }
    }
    return [s, <span style={{fontStyle: 'italic'}}>{s}</span>];
  }
}

interface MarkedNodes {
  selected: Node;
  referent: Node | undefined;
}

export interface TreeViewContext {
  markedNodes: MarkedNodes;
  editing: boolean;
  compileError: string | undefined;
  envLookups: EnvironmentLookups;
  parentLookup: Map<Node, Node>;
  dispatch: (action: any) => void; // TODO: tighten up type
  onSelectNode: (node: Node) => void;
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
      ctx.onSelectNode(node);
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

interface RowLayoutNode {
  sizedReactNode: SizedReactNode;
  treeNode?: Node; // we just use its identity for selection. may be undefined if not selectable
}

interface RowLayoutRow {
  indent: boolean;
  items: ReadonlyArray<string | RowLayoutNode>;
}

type RowLayout = ReadonlyArray<RowLayoutRow>;

const RowView: React.FC<{node: Node, layout: RowLayout, ctx: TreeViewContext}> = ({node, layout, ctx}) => {
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
        ctx.dispatch({
          type: 'SET_SELECTED_NODE',
          newNode: selectionRows[0][0].treeNode,
        });
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
                ctx.dispatch({
                  type: 'SET_SELECTED_NODE',
                  newNode: node,
                });
              } else {
                const newItemIdx = itemIdx - 1;
                ctx.dispatch({
                  type: 'SET_SELECTED_NODE',
                  newNode: selectionRows[rowIdx][newItemIdx].treeNode,
                });
              }
            } else if (e.key === 'ArrowRight') {
              if (itemIdx < (row.length - 1)) {
                e.stopPropagation();
                const newItemIdx = itemIdx + 1;
                ctx.dispatch({
                  type: 'SET_SELECTED_NODE',
                  newNode: selectionRows[rowIdx][newItemIdx].treeNode,
                });
              }
            } else if ((e.key === 'ArrowUp') && (rowIdx === 0)) {
              e.stopPropagation();
              ctx.dispatch({
                type: 'SET_SELECTED_NODE',
                newNode: node,
              });
            } else if ((e.key === 'ArrowDown') && (rowIdx === (selectionRows.length - 1))) {
              // Ignore, maybe ancestor will handle
            } else if ((e.key === 'ArrowUp') || (e.key === 'ArrowDown')) {
              const newRowIdx = rowIdx + ((e.key === 'ArrowDown') ? 1 : -1);
              e.stopPropagation();
              ctx.dispatch({
                type: 'SET_SELECTED_NODE',
                newNode: selectionRows[newRowIdx][0].treeNode,
              });
            }
          }
        });
      });
    }
  };

  return (
    <div ref={ref} className={selectionClasses.concat(['TreeView-row-view TreeView-node']).join(' ')} {...selectionHandlers} onKeyDown={onKeyDown}>
      {layout.map(row => {
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
          classes.push('TreeView-row-view-row-indented');
        }

        return (
          <div className={classes.join(' ')}>{itemElems}</div>
        );
      })}
    </div>
  );
}

const sizedRowView = ({node, layout, ctx}: {node: Node, layout: RowLayout, ctx: TreeViewContext}): SizedReactNode => {
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
    reactNode: <RowView node={node} layout={layout} ctx={ctx} />
  };
}

interface LabeledNode {
  label?: string;
  treeNode: Node;
  sizedReactNode: SizedReactNode;
}

const sizedAutoWrapRowView = ({node, labeledNodes, begin, end, ctx}: {node: Node, labeledNodes: ReadonlyArray<LabeledNode>, begin?: string, end?: string, ctx: TreeViewContext}): SizedReactNode => {
  const totalWidth = labeledNodes.reduce<number | undefined>((acc, ln) => ((ln.sizedReactNode.singleLineWidth === undefined) || (acc === undefined)) ? undefined : ln.sizedReactNode.singleLineWidth + acc, 0);
  const MAX_WIDTH = 25;

  let layout: Array<RowLayoutRow>;
  if ((totalWidth !== undefined) && (totalWidth < MAX_WIDTH)) {
    // Single-line layout
    const items: Array<string | RowLayoutNode> = [];

    if (begin) {
      items.push(begin);
    }

    for (const labeledNode of labeledNodes) {
      if (labeledNode.label) {
        items.push(labeledNode.label);
      }
      items.push({
        treeNode: labeledNode.treeNode,
        sizedReactNode: labeledNode.sizedReactNode,
      });
    }

    if (end) {
      items.push(end)
    }

    layout = [{
      indent: false,
      items,
    }];
  } else {
    // Multi-line layout
    layout = [];

    if (begin) {
      layout.push({
        indent: false,
        items: [begin],
      });
    }

    for (const labeledNode of labeledNodes) {
      if (labeledNode.label) {
        layout.push({
          indent: false,
          items: [labeledNode.label],
        });
      }
      layout.push({
        indent: true,
        items: [{
          treeNode: labeledNode.treeNode,
          sizedReactNode: labeledNode.sizedReactNode,
        }],
      });
    }

    if (end) {
      layout.push({
        indent: false,
        items: [end],
      });
    }
  };

  return sizedRowView({node, layout, ctx});
};

const sizedNameView = ({node, ctx}: {node: NameNode, ctx: TreeViewContext}): SizedReactNode => {
  return sizedSimpleNodeView({treeNode: node, content: node.text, bgColor: BOUND_NAME_BOX_COLOR, ctx});
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

  const [displayedName, ] = formatStreamDefinition(streamDef, ctx.envLookups);

  return sizedSimpleNodeView({treeNode: node, content: displayedName, bgColor: STREAM_REFERENCE_BOX_COLOR, ctx});
};

const sizedApplicationView = ({node, ctx}: {node: ApplicationNode, ctx: TreeViewContext}): SizedReactNode => {
  if (node.func.kind !== NodeKind.FunctionReference) {
    throw new Error('unimplemented');
  }

  const [functionNode, displayName] = getFunctionNodeAndDisplayName(node.func, ctx.envLookups);

  if (functionNode.sig.streamParams.length !== node.sargs.length) {
    throw new Error('stream params and args length mismatch');
  }
  if (functionNode.sig.funcParams.length !== node.fargs.length) {
    throw new Error('function params and args length mismatch');
  }

  if (node.func.ref === 'bind') {
    // special case rendering of bind for now
    const name = node.outs[0].name;
    if (!name) {
      throw new Error();
    }
    const layout: RowLayout = [{
      indent: false,
      items: [
        {
          treeNode: name,
          sizedReactNode: sizedNameView({node: name, ctx}),
        },
        '=',
        {
          treeNode: node.sargs[0],
          sizedReactNode: sizedStreamExpressionView({node: node.sargs[0], ctx}),
        }
      ],
    }];
    return sizedRowView({node, layout, ctx});
  } else {
    const showName = (n: NameNode | undefined | null) => n && !n.text.startsWith('_');

    const useNameAsFirstLabel = (functionNode.sig.streamParams.length > 0) && !showName(functionNode.sig.streamParams[0].name);

    const labeledNodes: Array<LabeledNode> = [];

    node.sargs.forEach((sarg, idx) => {
      const pname = functionNode.sig.streamParams[idx].name;

      labeledNodes.push({
        label: (useNameAsFirstLabel && (idx === 0)) ? displayName : (showName(pname) ? pname!.text : undefined),
        treeNode: sarg,
        sizedReactNode: sizedStreamExpressionView({node: sarg, ctx}),
      });
    });

    node.fargs.forEach((farg, idx) => {
      labeledNodes.push({
        // label: showName(pname) ? pname!.text : undefined,
        treeNode: farg,
        sizedReactNode: sizedFunctionExpressionView({node: farg, ctx}),
      });
    });

    return sizedAutoWrapRowView({node, labeledNodes, begin: (useNameAsFirstLabel ? undefined : displayName), ctx});
  }
};

const sizedStreamExpressionView = ({node, ctx}: {node: StreamExpressionNode, ctx: TreeViewContext}): SizedReactNode => {
  const nodeView: SizedReactNode = (() => {
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
  })();

  const selected = (ctx.markedNodes.selected === node);
  if (selected && ctx.editing) {
    const parent = ctx.parentLookup.get(node);
    if (!parent) {
      throw new Error();
    }
    const atRoot = parent.kind === NodeKind.TreeFunctionBody;

    const {singleLineWidth, reactNode} = nodeView;

    return {
      reactNode: (
        <div style={{position: 'relative'}}>
          {reactNode}
          <div style={{position: 'absolute', top: 0}}>
            <ExpressionChooser overNode={node} atRoot={atRoot} envLookups={ctx.envLookups} dispatch={ctx.dispatch} compileError={ctx.compileError} />
          </div>
        </div>
      ),
      singleLineWidth,
    };
  } else {
    return nodeView;
  }
}

const sizedBodyExpressionView = ({node, ctx}: {node: BodyExpressionNode, ctx: TreeViewContext}): SizedReactNode => {
  if (isStreamExpressionNode(node)) {
    return sizedStreamExpressionView({node, ctx});
  } else if (isFunctionExpressionNode(node)) {
    throw new Error('unimplemented');
  } else if (node.kind === NodeKind.YieldExpression) {
    const labeledNodes: Array<LabeledNode> = [
      {
        label: 'yield', // TODO: if there are multiple yields, clarify which
        treeNode: node.expr,
        sizedReactNode: sizedStreamExpressionView({node: node.expr, ctx}),
      },
    ];

    return sizedAutoWrapRowView({node, labeledNodes, ctx});
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
    throw new Error('unreachable');
  }
};

const sizedTreeFunctionDefinitionView = ({node, ctx}: {node: TreeFunctionDefinitionNode, ctx: TreeViewContext}): SizedReactNode => {
  const nameItem: RowLayoutNode | string = node.name ?
    {
      treeNode: node.name,
      sizedReactNode: sizedNameView({node: node.name, ctx}),
    }
    :
    'ƒ';

  let layout: Array<RowLayoutRow>;

  if ((node.sig.streamParams.length === 0) && (node.sig.funcParams.length === 0)) {
    layout = [
      {indent: false, items: [
        'define',
        nameItem,
        'as',
      ]},
    ];
  } else {
    // Some parameters
    layout = [];

    layout.push({indent: false, items: [
      'define',
      nameItem,
      'given',
    ]});

    node.sig.streamParams.forEach(sparam => {
      layout.push({
        indent: true,
        items: [{
          treeNode: sparam.name,
          sizedReactNode: sizedNameView({node: sparam.name, ctx}),
        }],
      });
    });

    layout.push({indent: false, items: [
      'as',
    ]});
  }

  for (const bodyExpr of node.body.exprs) {
    layout.push({
      indent: true,
      items: [
        {
          treeNode: bodyExpr,
          sizedReactNode: sizedBodyExpressionView({node: bodyExpr, ctx}),
        },
      ],
    });
  }

  return sizedRowView({node, layout, ctx});
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
