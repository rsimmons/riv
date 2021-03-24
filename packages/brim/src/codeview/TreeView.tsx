import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { Node, FunctionDefinitionNode, StreamExpressionNode, NodeKind, isStreamExpressionNode, StreamReferenceNode, ApplicationNode, ApplicationSettings, FunctionInterfaceNode, ApplicationArgNode, NameBindingNode, ParamNode, StreamParamNode, TreeImplBodyNode, FunctionImplNode, TreeImplNode, BindingExpressionNode, StreamBindingNode } from '../compiler/Tree';
import './TreeView.css';
import { StaticEnvironment } from './EditReducer';
import { TemplateLayout, TextSegment, GroupEditable } from '../compiler/TemplateLayout';
import quotesIcon from './icons/quotes.svg';
import booleanIcon from './icons/boolean.svg';
import { DynamicInterfaceEditAction, DynamicInterfaceChange } from '../compiler/FunctionInterface';

const BOUND_NAME_BOX_COLOR = '#d1e6ff';
const STREAM_REFERENCE_BOX_COLOR = '#a1cdff';

interface MarkedNodes {
  selected: Node;
  referentName: Node | undefined;
}

export interface TreeViewContext {
  markedNodes: MarkedNodes;
  staticEnvMap: ReadonlyMap<Node, StaticEnvironment>;
  setSelectedNode: (node: Node) => void;
  updateNode: (node: Node, newNode: Node) => void;
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

function keyModifiersEqual(e: React.KeyboardEvent<HTMLDivElement>, mods: ReadonlyArray<string>): boolean {
  const eventMods: Set<string> = new Set();

  for (const m of ['Alt', 'Control', 'Meta', 'Shift']) {
    if (e.getModifierState(m)) {
      eventMods.add(m);
    }
  }

  return (eventMods.size === mods.length) && mods.every(m => eventMods.has(m));
}

interface NodeSegment {
  kind: 'nodes';
  readonly sizedReactNode: SizedReactNode;
  readonly treeNode?: Node; // we just use its identity for selection. may be undefined if not selectable
}

export type LogicalSegment = TextSegment | NodeSegment;

export interface LogicalGroup {
  segments: ReadonlyArray<LogicalSegment>;
  editable?: GroupEditable;
}

export type LogicalLayout = ReadonlyArray<LogicalGroup>;

const MAX_ROW_WIDTH = 30;

const LogicalTextView: React.FC<{selectionNode: Node | undefined, outwardNode: Node, layout: LogicalLayout, singleLine: boolean, tightGrouping: boolean, ctx: TreeViewContext, onEdit?: (action: DynamicInterfaceEditAction, groupId: number) => void}> = ({selectionNode, outwardNode, layout, singleLine, tightGrouping, ctx, onEdit}) => {
  const ref = useRef<HTMLDivElement>(null);
  const {classes: selectionClasses, handlers: selectionHandlers} = useSelectable(selectionNode, ref, ctx);

  let selectionLayoutRowAccum: Array<Node> = [];
  let selectionLayout: Array<Array<Node>> = [];
  const emitSelectionRow = (): void => {
    if (selectionLayoutRowAccum.length > 0) {
      selectionLayout.push(selectionLayoutRowAccum);
      selectionLayoutRowAccum = [];
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (!keyModifiersEqual(e, [])) {
      return;
    }
    if ((e.key === 'ArrowRight') && (ref.current === e.target)) { // TODO: I think? instead we could check if selectionNode && (ctx.markedNodes.selected === selectionNode)
      if (selectionLayout.length > 0) {
        e.stopPropagation();
        ctx.setSelectedNode(selectionLayout[0][0]);
      }
    }
  };

  const reactNode = (
    <div ref={ref} className={selectionClasses.concat(['TreeView-node', 'TreeView-rounded-node', 'TreeView-logical', (singleLine ? 'TreeView-logical-horiz' : 'TreeView-logical-vert')]).join(' ')} onKeyDown={handleKeyDown} {...selectionHandlers}>{layout.map((group, groupIdx) => {
      const groupCompletedRows: Array<React.ReactNode> = [];
      let rowAccum: Array<React.ReactNode> = [];
      let rowWidth: number = 0;

      const emitRow = (indent: boolean): void => {
        if (rowAccum.length > 0) {
          const classes = ['TreeView-row-view-row'];
          if (indent) {
            classes.push('TreeView-row-view-row-indented');
          }
          if (tightGrouping) {
            classes.push('TreeView-row-view-row-tight');
          } else {
            classes.push('TreeView-row-view-row-loose');
          }

          groupCompletedRows.push(
            <div key={groupCompletedRows.length} className={classes.join(' ')}>{rowAccum}</div>
          );

          emitSelectionRow();
        }
        rowAccum = [];
        rowWidth = 0;
      };

      const pushNodeSegment = (segment: NodeSegment, key: string | number, onDeleteSelectedNode: () => boolean) => {
        let handleNodeKeyDown: ((e: React.KeyboardEvent<HTMLDivElement>) => void) | undefined = undefined;
        if (segment.treeNode) {
          const selectionRowIdx = selectionLayout.length;
          const selectionItemIdx = selectionLayoutRowAccum.length;

          handleNodeKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
            if (!keyModifiersEqual(e, [])) {
              return;
            }
            if (e.key === 'ArrowLeft') {
              e.stopPropagation();
              if (selectionItemIdx === 0) {
                ctx.setSelectedNode(outwardNode);
              } else {
                const newItemIdx = selectionItemIdx - 1;
                ctx.setSelectedNode(selectionLayout[selectionRowIdx][newItemIdx]);
              }
            } else if (e.key === 'ArrowRight') {
              if (selectionItemIdx < (selectionLayout[selectionRowIdx].length - 1)) {
                e.stopPropagation();
                const newItemIdx = selectionItemIdx + 1;
                ctx.setSelectedNode(selectionLayout[selectionRowIdx][newItemIdx]);
              }
            } else if ((e.key === 'ArrowUp') && (selectionRowIdx === 0)) {
              e.stopPropagation();
              ctx.setSelectedNode(outwardNode);
            } else if ((e.key === 'ArrowDown') && (selectionRowIdx === (selectionLayout.length - 1))) {
              // Ignore, maybe ancestor will handle
            } else if ((e.key === 'ArrowUp') || (e.key === 'ArrowDown')) {
              const newRowIdx = selectionRowIdx + ((e.key === 'ArrowDown') ? 1 : -1);
              e.stopPropagation();
              ctx.setSelectedNode(selectionLayout[newRowIdx][0]);
            } else if ((e.key === 'Backspace')) {
              if (segment.treeNode && (ctx.markedNodes.selected === segment.treeNode)) {
                if (onDeleteSelectedNode()) {
                  e.stopPropagation();
                  e.preventDefault();
                }
              }
            }
          };
        };
        const wrappedNode = (
          <div key={key} onKeyDown={handleNodeKeyDown}>{segment.sizedReactNode.reactNode}</div>
        );
        rowAccum.push(wrappedNode);
        if (segment.treeNode) {
          selectionLayoutRowAccum.push(segment.treeNode);
        }
      };

      const handleDeleteSelectedChildNode = (): boolean => {
        if (group.editable && group.editable.delete && onEdit) {
          onEdit('delete', groupIdx);
          return true;
        } else {
          console.log('ignoring delete');
          return false;
        }
      };

      group.segments.forEach((segment, segmentIdx) => {
        if (segment.kind === 'nodes') {
          const key: string | number = segment.treeNode ? segment.treeNode.nid : segmentIdx;
          if ((segment.sizedReactNode.singleLineWidth !== undefined) && ((rowWidth + segment.sizedReactNode.singleLineWidth) <= MAX_ROW_WIDTH)) {
            pushNodeSegment(segment, key, handleDeleteSelectedChildNode);
            rowWidth += segment.sizedReactNode.singleLineWidth;
          } else {
            emitRow(false);
            pushNodeSegment(segment, key, handleDeleteSelectedChildNode);
            emitRow(segmentIdx > 0);
          }
        } else if (segment.kind === 'text') {
          const ellipsis = false; // TODO: (rowAccum.length === 0) && (layout.length > 0);
          rowAccum.push(
            <div key={segmentIdx} className="TreeView-logical-plain-text">{(ellipsis ? '…' : '') + segment.text}</div>
          );
          rowWidth += segment.text.length;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const exhaustive: never = segment; // this will cause a type error if we haven't handled all cases
          throw new Error();
        }
      });

      const handleGroupKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
        if (group.editable && onEdit) {
          if (group.editable.insertBefore && ((singleLine && keyModifiersEqual(e, ['Shift']) && (e.key === 'ArrowLeft')) || (!singleLine && keyModifiersEqual(e, ['Shift']) && (e.key === 'ArrowUp')))) {
            onEdit('insert-before', groupIdx);
            e.stopPropagation();
            e.preventDefault();
          }
          if (group.editable.insertAfter && ((singleLine && keyModifiersEqual(e, ['Shift']) && (e.key === 'ArrowRight')) || (!singleLine && keyModifiersEqual(e, ['Shift']) && (e.key === 'ArrowDown')))) {
            onEdit('insert-after', groupIdx);
            e.stopPropagation();
            e.preventDefault();
          }
        }
      };

      if (singleLine) {
        return (
          <div key={groupIdx} className="TreeView-logical-group-horiz" onKeyDown={handleGroupKeyDown}>
            {rowAccum}
          </div>
        );
      } else {
        emitRow(false);
        return (
          <div key={groupIdx} className="TreeView-logical-group-vert" onKeyDown={handleGroupKeyDown}>
            {groupCompletedRows}
          </div>
        );
      }
    })}</div>
  );
  emitSelectionRow();

  return reactNode;
}

const sizedLogicalTextView = ({selectionNode, outwardNode, layout, tightGrouping, ctx, onEdit}: {selectionNode: Node | undefined, outwardNode: Node, layout: LogicalLayout, tightGrouping: boolean, ctx: TreeViewContext, onEdit?: (action: DynamicInterfaceEditAction, groupId: number) => void}): SizedReactNode => {
  // Determine how wide it would be if a single line (if possible)
  let singleLineWidth: number | undefined = 0;

  for (const group of layout) {
    for (const segment of group.segments) {
      switch (segment.kind) {
        case 'nodes':
          singleLineWidth = (segment.sizedReactNode.singleLineWidth === undefined) ? undefined : (singleLineWidth! + segment.sizedReactNode.singleLineWidth);
          break;

        case 'text':
          singleLineWidth! += segment.text.length;
          break;

        default: {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const exhaustive: never = segment; // this will cause a type error if we haven't handled all cases
          throw new Error();
        }
      }
    }
    if (singleLineWidth === undefined) {
      break;
    }
  }

  const singleLine = ((singleLineWidth !== undefined) && (singleLineWidth <= MAX_ROW_WIDTH));

  return {
    reactNode: <LogicalTextView selectionNode={selectionNode} outwardNode={outwardNode} layout={layout} tightGrouping={tightGrouping} ctx={ctx} singleLine={singleLine} onEdit={onEdit} />,
    singleLineWidth,
  };
}

const sizedStreamReferenceView = ({node, ctx}: {node: StreamReferenceNode, ctx: TreeViewContext}): SizedReactNode => {
  const env = ctx.staticEnvMap.get(node);
  if (!env) {
    throw new Error();
  }
  const nameBinding = env.streamEnv.get(node.ref);
  if (!nameBinding) {
    throw new Error();
  }

  return sizedSimpleNodeView({treeNode: node, content: nameBinding.name.text || '\xa0\xa0\xa0\xa0', bgColor: STREAM_REFERENCE_BOX_COLOR, ctx});
};

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

const sizedApplicationView = ({node, ctx}: {node: ApplicationNode, ctx: TreeViewContext}): SizedReactNode => {
  interface TreeAndSizedNodes {
    readonly sizedReactNode: SizedReactNode;
    readonly treeNode?: Node; // we just use its identity for selection. may be undefined if not selectable
  }

  const templateToLogicalLayout = (template: TemplateLayout, nodeMap: ReadonlyMap<string, TreeAndSizedNodes>): LogicalLayout => {
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
            sizedReactNode: nodes.sizedReactNode,
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

  const env = ctx.staticEnvMap.get(node);
  if (!env) {
    throw new Error();
  }
  const funcIface = env.functionEnv.get(node.fid);
  if (!funcIface) {
    throw new Error();
  }

  const sizedArgNode = (argNode: ApplicationArgNode): SizedReactNode => {
    if (argNode.kind === NodeKind.FunctionDefinition) {
      return sizedFunctionDefinitionView({node: argNode, ctx});
    } else if (isStreamExpressionNode(argNode)) {
      return sizedStreamExpressionView({node: argNode, ctx});
    } else {
      throw new Error();
    }
  };

  const layout: Array<LogicalGroup> = [];
  layout.push({
    segments: [{
      kind: 'text',
      text: funcIface.name.text,
    }],
  });
  funcIface.params.forEach(param => {
    const argNode = node.args.get(param.nid);
    if (!argNode) {
      throw new Error();
    }
    layout.push({
      segments: [{
        kind: 'nodes',
        treeNode: argNode,
        sizedReactNode: sizedArgNode(argNode),
      }],
    });
  });
  return sizedLogicalTextView({
    selectionNode: node,
    outwardNode: node,
    layout,
    tightGrouping: true,
    ctx,
  });

/*
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

  const iface = functionInterfaceFromStaticNode(funcDef.iface);
  return sizedLogicalTextView({
    selectionNode: node,
    outwardNode: node,
    layout: templateToLogicalLayout(iface.tmpl, nodeMap),
    tightGrouping: true,
    ctx,
  });
*/

/*
    case NodeKind.DynamicFunctionInterface: {
      const ifaceNode = funcDef.iface;
      const tifspec = ifaceNode.getIface(node.settings);
      const ifaceOnEdit = ifaceNode.onEdit;

      const handleChange = (change: DynamicInterfaceChange): void => {
        const {newSettings, remap, newSelectedKey} = change;
        const newIface = ifaceNode.getIface(newSettings);

        const newNode: ApplicationNode = {
          ...node,
          settings: newSettings,
          ...(remap === undefined) ? {} : {
            sargs: remap.streamParams.map(fromIdx => {
              return (fromIdx !== undefined) ? node.sargs[fromIdx] : {
                kind: NodeKind.UndefinedLiteral,
                sid: generateStreamId(),
              };
            }),
            fargs: remap.funcParams.map((fromIdx, idx) => {
              return (fromIdx !== undefined) ? node.fargs[fromIdx] : defaultTreeImplFromFunctionInterface(newIface.funcParams[idx].iface);
            }),
          },
        };

        ctx.updateNode(node, newNode);
        if (newSelectedKey === undefined) {
          // TODO: we should verify that the selected node is still valid
        } else if (newSelectedKey === 'parent') {
          ctx.setSelectedNode(newNode);
        } else {
          const newNodeMap: Map<string, Node> = new Map();
          newNode.sargs.forEach((sarg, idx) => {
            newNodeMap.set('s' + idx, sarg);
          });
          newNode.fargs.forEach((farg, idx) => {
            newNodeMap.set('f' + idx, farg);
          });
          newNode.outs.forEach((out, idx) => {
            if (out.name) {
              newNodeMap.set('y' + idx, out.name);
            }
          });

          const newSelNode = newNodeMap.get(newSelectedKey);
          if (!newSelNode) {
            throw new Error();
          }
          ctx.setSelectedNode(newSelNode);
        }
      };

      const logicalView = sizedLogicalTextView({
        selectionNode: node,
        outwardNode: node,
        layout: templateToLogicalLayout(tifspec.tmpl, nodeMap),
        tightGrouping: true,
        ctx,
        onEdit: ifaceOnEdit ? (action, groupId) => {
          handleChange(ifaceOnEdit(action, groupId, node.settings));
        } : undefined,
      });

      const ifaceCreateCustomUI = ifaceNode.createCustomUI;
      if (ifaceCreateCustomUI) {
        return {
          reactNode: <CustomUIView logicalReactNode={logicalView.reactNode} createCustomUI={ifaceCreateCustomUI} settings={node.settings} onChange={handleChange} />,
          singleLineWidth: undefined,
        };
      } else {
        return logicalView;
      }
    }
*/
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

const sizedNameBindingView = ({node, ctx}: {node: NameBindingNode, ctx: TreeViewContext}): SizedReactNode => {
  return sizedSimpleNodeView({treeNode: node, content: node.name.text || '\xa0\xa0\xa0\xa0', bgColor: BOUND_NAME_BOX_COLOR, ctx});
}

const sizedBindingExpressionView = ({node, ctx}: {node: BindingExpressionNode, ctx: TreeViewContext}): SizedReactNode => {
  switch (node.kind) {
    case NodeKind.NameBinding:
      return sizedNameBindingView({node, ctx});

    default: {
      throw new Error();
    }
  }
}

const sizedStreamParamView = ({node, ctx}: {node: StreamParamNode, ctx: TreeViewContext}): SizedReactNode => {
  const layout: Array<LogicalGroup> = [];

  layout.push({
    segments: [
      {
        kind: 'text',
        text: 'param',
      },
      {
        kind: 'nodes',
        treeNode: node.bind,
        sizedReactNode: sizedNameBindingView({node: node.bind, ctx}),
      },
    ],
  });

  return sizedLogicalTextView({selectionNode: node, outwardNode: node, layout, tightGrouping: true, ctx});
}

const sizedParamView = ({node, ctx}: {node: ParamNode, ctx: TreeViewContext}): SizedReactNode => {
  switch (node.kind) {
    case NodeKind.StreamParam:
      return sizedStreamParamView({node, ctx});

    case NodeKind.FunctionParam:
      // TODO: show interface
      return sizedSimpleNodeView({treeNode: node, content: 'fparam', bgColor: BOUND_NAME_BOX_COLOR, ctx});

    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
      throw new Error();
    }
  }
}

const sizedFunctionInterfaceView = ({node, ctx}: {node: FunctionInterfaceNode, ctx: TreeViewContext}): SizedReactNode => {
  const layout: Array<LogicalGroup> = [];

  layout.push({
    segments: [
      {
        kind: 'nodes',
        treeNode: node.name,
        sizedReactNode: sizedSimpleNodeView({treeNode: node, content: node.name.text || '\xa0\xa0\xa0\xa0', bgColor: BOUND_NAME_BOX_COLOR, ctx}),
      }
    ],
  });

  node.params.forEach(param => {
    layout.push({
      segments: [
        {
          kind: 'nodes',
          treeNode: param,
          sizedReactNode: sizedParamView({node: param, ctx}),
        }
      ],
    });
  });

  layout.push({
    segments: [
      {
        kind: 'text',
        text: '→',
      },
      {
        kind: 'text',
        text: node.output ? '(something)' : '(void)'
      },
    ],
  });

  return sizedLogicalTextView({selectionNode: node, outwardNode: node, layout, tightGrouping: true, ctx});
}

export const sizedStreamBindingView = ({node, ctx}: {node: StreamBindingNode, ctx: TreeViewContext}): SizedReactNode => {
  const layout: Array<LogicalGroup> = [];

  layout.push({
    segments: [
      {
        kind: 'nodes',
        treeNode: node.bexpr,
        sizedReactNode: sizedBindingExpressionView({node: node.bexpr, ctx}),
      },
    ],
  });

  layout.push({
    segments: [
      {
        kind: 'text',
        text: ' = ',
      },
    ]
  });

  layout.push({
    segments: [
      {
        kind: 'nodes',
        treeNode: node.sexpr,
        sizedReactNode: sizedStreamExpressionView({node: node.sexpr, ctx}),
      },
    ],
  });

  return sizedLogicalTextView({selectionNode: undefined, outwardNode: node, layout, tightGrouping: true, ctx});
}

const sizedTreeImplBodyView = ({node, ctx}: {node: TreeImplBodyNode, ctx: TreeViewContext}): SizedReactNode => {
  if (isStreamExpressionNode(node)) {
    return sizedStreamExpressionView({node, ctx});
  } else if (node.kind === NodeKind.StreamBinding) {
    return sizedStreamBindingView({node, ctx});
  } else if (node.kind === NodeKind.FunctionDefinition) {
    return sizedFunctionDefinitionView({node, ctx});
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
    throw new Error('unreachable');
  }
};

const sizedTreeImplView = ({node, ctx}: {node: TreeImplNode, ctx: TreeViewContext}): SizedReactNode => {
  const layout: Array<LogicalGroup> = [];
  node.body.forEach(bodyNode => {
    layout.push({
      segments: [{
        kind: 'nodes',
        treeNode: bodyNode,
        sizedReactNode: sizedTreeImplBodyView({node: bodyNode, ctx}),
      }],
    });
  });

  if (node.out) {
    layout.push({
      segments: [
        {
          kind: 'text',
          text: '←',
        },
        {
          kind: 'nodes',
          treeNode: node.out,
          sizedReactNode: sizedStreamExpressionView({node: node.out, ctx}),
        },
      ],
    });
  }

  return sizedLogicalTextView({selectionNode: undefined, outwardNode: node, layout, tightGrouping: false, ctx});
}

const sizedFunctionImplView = ({node, ctx}: {node: FunctionImplNode, ctx: TreeViewContext}): SizedReactNode => {
  switch (node.kind) {
    case NodeKind.NativeImpl:
      throw new Error('unimplemented');

    case NodeKind.TreeImpl:
      return sizedTreeImplView({node, ctx});

    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
      throw new Error();
    }
  }
}

export const FunctionDefinitionView: React.FC<{node: FunctionDefinitionNode, ctx: TreeViewContext}> = ({ node, ctx }) => {
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
      if ((node.impl.kind === NodeKind.TreeImpl) && (node.impl.body.length > 0)) {
        e.stopPropagation();
        ctx.setSelectedNode(node.impl.body[0]);
      }
    }
  };

  const ifaceReactNode: React.ReactNode = sizedFunctionInterfaceView({node: node.iface, ctx}).reactNode;
  const implReactNode: React.ReactNode = sizedFunctionImplView({node: node.impl, ctx}).reactNode;

  return (
    <div ref={ref} className={selectionClasses.concat(['TreeView-node', 'TreeView-function-definition']).join(' ')} {...selectionHandlers} onKeyDown={onKeyDown}>
      <div className="TreeView-function-iface">{ifaceReactNode}</div>
      <div className="TreeView-function-impl">{implReactNode}</div>
    </div>
  );
}

const sizedFunctionDefinitionView = ({node, ctx}: {node: FunctionDefinitionNode, ctx: TreeViewContext}): SizedReactNode => {
  return {
    singleLineWidth: undefined,
    reactNode: <FunctionDefinitionView node={node} ctx={ctx} />,
  };
};
