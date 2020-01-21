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

export interface TreeViewContextData {
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

function useSelectable(node: Node, ref: React.RefObject<HTMLDivElement>, ctxData: TreeViewContextData): UseSelectableResult {
  const [hovered, setHovered] = useState(false);

  const handleClick = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if ((e.target as Element).tagName !== 'INPUT') {
      e.stopPropagation();
      ctxData.onSelectNode(node);
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

  const selected = (ctxData.markedNodes.selected === node);
  const referent = (ctxData.markedNodes.referent === node);
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
    if (ctxData.focusSelected && selected && ref.current) {
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
  Node: React.FC<{}>; // a function-component that takes no props (they are "pre-bound" via a closure)
}

const simpleNodeView = ({treeNode, content, bgColor, ctxData}: {treeNode: Node, content: string, bgColor: string, ctxData: TreeViewContextData}): SizedReactNode => {
  return {
    singleLineWidth: content.length,
    Node: () => {
      const ref = useRef<HTMLDivElement>(null);
      const {classes: selectionClasses, handlers: selectionHandlers} = useSelectable(treeNode, ref, ctxData);
      return (
        <div ref={ref} className={selectionClasses.concat(['TreeView-node']).join(' ')} {...selectionHandlers} style={{background: bgColor}}>{content}</div>
      );
    },
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

const rowView = ({node, layout, ctxData}: {node: Node, layout: RowLayout, ctxData: TreeViewContextData}): SizedReactNode => {
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
    Node: () => {
      const ref = useRef<HTMLDivElement>(null);
      const {classes: selectionClasses, handlers: selectionHandlers} = useSelectable(node, ref, ctxData);

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
            ctxData.dispatch({
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
                    ctxData.dispatch({
                      type: 'SET_SELECTED_NODE',
                      newNode: node,
                    });
                  } else {
                    const newItemIdx = itemIdx - 1;
                    ctxData.dispatch({
                      type: 'SET_SELECTED_NODE',
                      newNode: selectionRows[rowIdx][newItemIdx].treeNode,
                    });
                  }
                } else if (e.key === 'ArrowRight') {
                  if (itemIdx < (row.length - 1)) {
                    e.stopPropagation();
                    const newItemIdx = itemIdx + 1;
                    ctxData.dispatch({
                      type: 'SET_SELECTED_NODE',
                      newNode: selectionRows[rowIdx][newItemIdx].treeNode,
                    });
                  }
                } else if ((e.key === 'ArrowUp') && (rowIdx === 0)) {
                  e.stopPropagation();
                  ctxData.dispatch({
                    type: 'SET_SELECTED_NODE',
                    newNode: node,
                  });
                } else if ((e.key === 'ArrowDown') && (rowIdx === (selectionRows.length - 1))) {
                  // Ignore, maybe ancestor will handle
                } else if ((e.key === 'ArrowUp') || (e.key === 'ArrowDown')) {
                  const newRowIdx = rowIdx + ((e.key === 'ArrowDown') ? 1 : -1);
                  e.stopPropagation();
                  ctxData.dispatch({
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

                const Node = item.sizedReactNode.Node;

                itemElems.push(
                  <div ref={ref}><Node /></div>
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
    },
  };
}

interface LabeledNode {
  label?: string;
  treeNode: Node;
  sizedReactNode: SizedReactNode;
}

const autoWrapRowView = ({node, labeledNodes, begin, end, ctxData}: {node: Node, labeledNodes: ReadonlyArray<LabeledNode>, begin?: string, end?: string, ctxData: TreeViewContextData}): SizedReactNode => {
  const totalWidth = labeledNodes.reduce<number | undefined>((acc, ln) => ((ln.sizedReactNode.singleLineWidth === undefined) || (acc === undefined)) ? undefined : ln.sizedReactNode.singleLineWidth + acc, 0);
  const MAX_WIDTH = 30;

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

  return rowView({node, layout, ctxData});
};

const nameView = ({node, ctxData}: {node: NameNode, ctxData: TreeViewContextData}): SizedReactNode => {
  return simpleNodeView({treeNode: node, content: node.text, bgColor: BOUND_NAME_BOX_COLOR, ctxData});
};

const streamReferenceView = ({node, ctxData}: {node: StreamReferenceNode, ctxData: TreeViewContextData}): SizedReactNode => {
  const nearestDef = ctxData.envLookups.nodeToNearestTreeDef.get(node);
  if (!nearestDef) {
    throw new Error();
  }
  const nodeStreamEnv = ctxData.envLookups.treeDefToStreamEnv.get(nearestDef);
  if (!nodeStreamEnv) {
    throw new Error();
  }
  const streamDef = nodeStreamEnv.get(node.ref);
  if (!streamDef) {
    throw new Error();
  }

  const [displayedName, ] = formatStreamDefinition(streamDef, ctxData.envLookups);

  return simpleNodeView({treeNode: node, content: displayedName, bgColor: STREAM_REFERENCE_BOX_COLOR, ctxData});
};

const applicationView = ({node, ctxData}: {node: ApplicationNode, ctxData: TreeViewContextData}): SizedReactNode => {
  if (node.func.kind !== NodeKind.FunctionReference) {
    throw new Error('unimplemented');
  }

  const [functionNode, displayName] = getFunctionNodeAndDisplayName(node.func, ctxData.envLookups);

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
          sizedReactNode: nameView({node: name, ctxData}),
        },
        '=',
        {
          treeNode: node.sargs[0],
          sizedReactNode: streamExpressionView({node: node.sargs[0], ctxData}),
        }
      ],
    }];
    return rowView({node, layout, ctxData});
  } else {
    const showName = (n: NameNode | undefined | null) => n && !n.text.startsWith('_');

    const useNameAsFirstLabel = (functionNode.sig.streamParams.length > 0) && !showName(functionNode.sig.streamParams[0].name);

    const labeledNodes: Array<LabeledNode> = [];

    node.sargs.forEach((sarg, idx) => {
      const pname = functionNode.sig.streamParams[idx].name;

      labeledNodes.push({
        label: (useNameAsFirstLabel && (idx === 0)) ? displayName : (showName(pname) ? pname!.text : undefined),
        treeNode: sarg,
        sizedReactNode: streamExpressionView({node: sarg, ctxData}),
      });
    });

    node.fargs.forEach((farg, idx) => {
      labeledNodes.push({
        // label: showName(pname) ? pname!.text : undefined,
        treeNode: farg,
        sizedReactNode: functionExpressionView({node: farg, ctxData}),
      });
    });

    return autoWrapRowView({node, labeledNodes, begin: (useNameAsFirstLabel ? undefined : displayName), ctxData});
  }
};

const streamExpressionView = ({node, ctxData}: {node: StreamExpressionNode, ctxData: TreeViewContextData}): SizedReactNode => {
  const nodeView: SizedReactNode = (() => {
    switch (node.kind) {
      case NodeKind.UndefinedLiteral:
        return simpleNodeView({treeNode: node, content: '\xa0\xa0\xa0\xa0\xa0\xa0', bgColor: 'red', ctxData});

      case NodeKind.NumberLiteral:
        return simpleNodeView({treeNode: node, content: node.val.toString(), bgColor: '#cce8cc', ctxData});

      case NodeKind.TextLiteral:
        return simpleNodeView({treeNode: node, content: node.val, bgColor: '#cce8cc', ctxData});

      case NodeKind.BooleanLiteral:
        return simpleNodeView({treeNode: node, content: node.val.toString(), bgColor: '#cce8cc', ctxData});

      case NodeKind.StreamReference:
        return streamReferenceView({node, ctxData});

      case NodeKind.Application:
        return applicationView({node, ctxData});

      default: {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
        throw new Error();
      }
    }
  })();

  const selected = (ctxData.markedNodes.selected === node);
  if (selected && ctxData.editing) {
    const parent = ctxData.parentLookup.get(node);
    if (!parent) {
      throw new Error();
    }
    const atRoot = parent.kind === NodeKind.TreeFunctionBody;

    const {singleLineWidth, Node} = nodeView;

    return {
      Node: () => (
        <div style={{position: 'relative'}}>
          <Node />>
          <div style={{position: 'absolute', top: 0}}><ExpressionChooser overNode={node} atRoot={atRoot} envLookups={ctxData.envLookups} dispatch={ctxData.dispatch} compileError={ctxData.compileError} /></div>
        </div>
      ),
      singleLineWidth,
    };
  } else {
    return nodeView;
  }
}

const bodyExpressionView = ({node, ctxData}: {node: BodyExpressionNode, ctxData: TreeViewContextData}): SizedReactNode => {
  if (isStreamExpressionNode(node)) {
    return streamExpressionView({node, ctxData});
  } else if (isFunctionExpressionNode(node)) {
    throw new Error('unimplemented');
  } else if (node.kind === NodeKind.YieldExpression) {
    const labeledNodes: Array<LabeledNode> = [
      {
        label: 'yield', // TODO: if there are multiple yields, clarify which
        treeNode: node.expr,
        sizedReactNode: streamExpressionView({node: node.expr, ctxData}),
      },
    ];

    return autoWrapRowView({node, labeledNodes, ctxData});
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
    throw new Error('unreachable');
  }
};

const treeFunctionDefinitionView = ({node, ctxData}: {node: TreeFunctionDefinitionNode, ctxData: TreeViewContextData}): SizedReactNode => {
  const nameItem: RowLayoutNode | string = node.name ?
    {
      treeNode: node.name,
      sizedReactNode: nameView({node: node.name, ctxData}),
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
          sizedReactNode: nameView({node: sparam.name, ctxData}),
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
          sizedReactNode: bodyExpressionView({node: bodyExpr, ctxData}),
        },
      ],
    });
  }

  return rowView({node, layout, ctxData});
};

const functionDefinitionView = ({node, ctxData}: {node: FunctionDefinitionNode, ctxData: TreeViewContextData}): SizedReactNode => {
  if (node.kind === NodeKind.TreeFunctionDefinition) {
    return treeFunctionDefinitionView({node, ctxData});
  } else if (node.kind === NodeKind.NativeFunctionDefinition) {
    throw new Error('unimplemented');
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
    throw new Error('unreachable');
  }
};

const functionExpressionView = ({node, ctxData}: {node: FunctionExpressionNode, ctxData: TreeViewContextData}): SizedReactNode => {
  if (node.kind === NodeKind.FunctionReference) {
    throw new Error('unimplemented');
  } else if (isFunctionDefinitionNode(node)) {
    return functionDefinitionView({node, ctxData});
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
    throw new Error('unreachable');
  }
};

export const TreeFunctionDefinitionView: React.FC<{node: TreeFunctionDefinitionNode, ctxData: TreeViewContextData}> = ({ node, ctxData }) => {
  const {Node} = treeFunctionDefinitionView({node, ctxData});
  return <Node />
}
