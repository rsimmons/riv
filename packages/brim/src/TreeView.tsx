import React, { createContext, useContext, useState, useRef, createRef, MutableRefObject, RefObject, useLayoutEffect, CSSProperties } from 'react';
import { StreamID, FunctionID, Node, DescriptionNode, FunctionDefinitionNode, TreeFunctionDefinitionNode, StreamExpressionNode, BodyExpressionNode, NodeKind, isStreamExpressionNode, isFunctionExpressionNode, TreeFunctionBodyNode, FunctionExpressionNode, isFunctionDefinitionNode, UndefinedLiteralNode, NumberLiteralNode, YieldExpressionNode, ApplicationNode, FunctionReferenceNode, StreamReferenceNode } from './Tree';
import ExpressionChooser from './ExpressionChooser';
import './TreeView.css';
import { EnvironmentLookups } from './EditReducer';

const NORMAL_BOX_COLOR = '#d8d8d8';
const STREAM_REFERENCE_BOX_COLOR = '#a1cdff';
const STREAM_DESC_BOX_COLOR = '#d2e6ff';

export interface TreeViewContextData {
  selectedNode: Node;
  editing: boolean;
  envLookups: EnvironmentLookups;
  dispatch: (action: any) => void; // TODO: tighten up type
  onSelectNode: (node: Node) => void;
};
const TreeViewContext = createContext<TreeViewContextData | null>(null);
export const TreeViewContextProvider = TreeViewContext.Provider;

interface UseSelectableResult {
  classes: ReadonlyArray<string>;
  handlers: {
    onClick?: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void,
    onMouseOver?: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void,
    onMouseOut?: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void,
  };
}

function useSelectable(node: Node | null): UseSelectableResult {
  const [hovered, setHovered] = useState(false);

  const ctxData = useContext(TreeViewContext);
  if (!ctxData) {
    throw new Error();
  }

  if (!node) {
    return {
      classes: [],
      handlers: {},
    };
  }

  const selected = (ctxData.selectedNode === node);

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

  if (selected) {
    classes.push('TreeView-selected');
  }
  if (hovered) {
    classes.push('TreeView-hovered');
  }
  // TODO: handle clipboard-top, clipboard-rest?

  return {
    classes,
    handlers: {
      onClick: handleClick,
      onMouseOver: handleMouseOver,
      onMouseOut: handleMouseOut,
    }
  };
}

const CXN_COLOR = '#999';
const CXN_MIN_LENGTH = '0.3em';

const SimpleConnection: React.FC<{connected: boolean}> = ({connected}) => {
  if (connected) {
    return (
      <div style={{minWidth: CXN_MIN_LENGTH, display: 'flex', flexDirection: 'column'}}>
        <div style={{flex: '1'}} />
        <div style={{flex: '0 0 1px', background: CXN_COLOR}} />
        <div style={{flex: '1'}} />
      </div>
    );
  } else {
    return null;
  }
}

// Used by "simple" stream nodes that just need to report their attachment offset as their vertical midpoint
// TODO: Really, children should be reporting their attachment offset AND their height? I think the way it is now,
// there could be a bug where a child's attachment offset stays the same but its height changes, and this isn't accounted for.
function useReportSimpleAttachmentOffset(reportAttachmentOffset?: (offset: number) => void): RefObject<HTMLDivElement> {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (reportAttachmentOffset) {
      if (!ref.current) {
        throw new Error();
      }
      const rect = ref.current.getBoundingClientRect();
      reportAttachmentOffset(0.5*(rect.bottom - rect.top));
    }
  });

  return ref;
}

const DescriptionNodeView: React.FC<{node: DescriptionNode, reportAttachmentOffset?: (offset: number) => void}> = ({node, reportAttachmentOffset}) => {
  const {classes: selectionClasses, handlers: selectionHandlers} = useSelectable(node);
  const ref = useReportSimpleAttachmentOffset(reportAttachmentOffset);
  return (
    <div ref={ref} className={selectionClasses.concat(['TreeView-simple-node', 'TreeView-common-padding']).join(' ')} {...selectionHandlers} style={{background: STREAM_DESC_BOX_COLOR}}>{node.text}&nbsp;=</div>
  );
}

const SingleChildNodeView: React.FC<{node: Node, contents: React.ReactNode, boxColor: string, child: React.ReactNode}> = ({node, contents, boxColor, child}) => {
  const {classes: selectionClasses, handlers: selectionHandlers} = useSelectable(node);

  return (
    <div style={{display: 'flex'}}>
      <div className={selectionClasses.concat(['TreeView-simple-node', 'TreeView-common-padding']).join(' ')} {...selectionHandlers} style={{background: boxColor}}>{contents}</div>
      <div className="TreeView-appish-node-child-cxn-triangle"><div /></div>
      {child}
    </div>
  );
};

const ChildlessStreamNodeView: React.FC<{node: UndefinedLiteralNode | NumberLiteralNode, contents: React.ReactNode, boxColor: string, connected: boolean, reportAttachmentOffset?: (offset: number) => void}> = ({node, contents, boxColor, connected, reportAttachmentOffset}) => {
  const {classes: selectionClasses, handlers: selectionHandlers} = useSelectable(node);
  const ref = useReportSimpleAttachmentOffset(reportAttachmentOffset);

  return (
    <div ref={ref} style={{display: 'flex'}}>
      <SimpleConnection connected={connected} />
      {node.desc && <DescriptionNodeView node={node.desc} />}
      <div className={selectionClasses.concat(['TreeView-simple-node', 'TreeView-common-padding']).join(' ')} {...selectionHandlers} style={{background: boxColor}}>{contents}</div>
    </div>
  );
};

const StreamReferenceView: React.FC<{node: StreamReferenceNode, connected: boolean, reportAttachmentOffset?: (offset: number) => void}> = ({node, connected, reportAttachmentOffset}) => {
  const ctxData = useContext(TreeViewContext);
  if (!ctxData) {
    throw new Error();
  }
  const {classes: selectionClasses, handlers: selectionHandlers} = useSelectable(node);
  const ref = useReportSimpleAttachmentOffset(reportAttachmentOffset);

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

  const displayedDesc: string = streamDef.desc ? streamDef.desc.text : ('<stream ' + node.ref + '>');

  return (
    <div ref={ref} style={{display: 'flex'}}>
      <SimpleConnection connected={connected} />
      <div className={selectionClasses.concat(['TreeView-simple-node', 'TreeView-common-padding']).join(' ')} {...selectionHandlers} style={{background: STREAM_REFERENCE_BOX_COLOR}}>{displayedDesc}</div>
    </div>
  );
};

interface AppishNodeChild<T> {
  key: string | number | undefined;
  name: string | undefined;
  node: T;
}

interface AppishNodeProps {
  node: Node | null;
  name: React.ReactNode;
  boxColor: string;
  streamArgs: ReadonlyArray<AppishNodeChild<StreamExpressionNode>>;
  functionArgs: ReadonlyArray<AppishNodeChild<FunctionDefinitionNode>>;
  yields: ReadonlyArray<AppishNodeChild<DescriptionNode | undefined>>;
  retIdx: number; // which yield is connected to parent
  connected: boolean;
  reportAttachmentOffset?: (offset: number) => void;
}

const AppishNodeView: React.FC<AppishNodeProps> = ({node, name, boxColor, streamArgs, functionArgs, yields, retIdx, connected, reportAttachmentOffset}) => {
  let streamLabels: ReadonlyArray<string | undefined>;
  let streamChildAtBar: boolean;
  if ((streamArgs.length === 1) && (streamArgs[0].name === undefined)) {
    streamChildAtBar = true;
    streamLabels = [];
  } else {
    streamChildAtBar = false;
    streamLabels = streamArgs.map(({name}) => name);
  }

  let yieldLabels: ReadonlyArray<string | undefined>;
  let yieldAtBar: boolean;
  if ((yields.length === 1) && (yields[0].name === undefined)) {
    yieldAtBar = true;
    yieldLabels = [];
  } else {
    yieldAtBar = false;
    yieldLabels = yields.map(({name}) => name);
  }

  const nameBarRef = useRef<HTMLDivElement>(null);
  const yieldDescsRef = useRef<HTMLDivElement>(null);
  const yieldLabelsRef = useRef<HTMLDivElement>(null);
  const streamLabelsRef = useRef<HTMLDivElement>(null);
  const streamChildrenRef = useRef<HTMLDivElement>(null);

  const [reportedStreamChildAttachmentOffsets, setReportedStreamChildAttachmentOffsets] = useState<Array<number>>([]);

  useLayoutEffect(() => {
    const getHeight = (n: any) => {
      if (!(n instanceof HTMLElement)) {
        throw new Error();
      }
      const rect = n.getBoundingClientRect();
      return rect.bottom - rect.top;
    };

    const setTopMargin = (cn: ChildNode, px: number) => {
      if (!(cn instanceof HTMLElement)) {
        throw new Error();
      }
      cn.style.marginTop = (px + 'px');
    };

    const childrenToArr = (elem: HTMLDivElement) => [...elem.childNodes].map(cn => {
      if (!(cn instanceof HTMLElement)) {
        throw new Error();
      }
      return cn;
    });

    if (!nameBarRef.current || !yieldDescsRef.current || !streamChildrenRef.current) {
      throw new Error();
    }
    const yieldDescElems = childrenToArr(yieldDescsRef.current);
    const streamChildElems = childrenToArr(streamChildrenRef.current);

    const nameBarHeight = getHeight(nameBarRef.current);
    const nameBarAttachmentOffset = 0.5*nameBarHeight;

    const yieldDescHeights = yieldDescElems.map(elem => getHeight(elem));
    const streamChildrenHeights = streamChildElems.map(elem => getHeight(elem));

    const streamChildAttachmentOffsets = streamChildrenHeights.map((_, idx) => reportedStreamChildAttachmentOffsets[idx] || 0);

    const yieldAtBarMinAttachmentOffset = yieldAtBar ? 0.5*yieldDescHeights[0] : 0;
    const streamChildAtBarMinAttachmentOffset = streamChildAtBar ? streamChildAttachmentOffsets[0] : 0;
    const lrBarMinAttachmentOffset = Math.max(yieldAtBarMinAttachmentOffset, streamChildAtBarMinAttachmentOffset);
    const nameBarSpacing = Math.max(lrBarMinAttachmentOffset - nameBarAttachmentOffset, 0);

    setTopMargin(nameBarRef.current, nameBarSpacing);

    const SPACING = 5;

    if (yieldAtBar) {
      setTopMargin(yieldDescElems[0], nameBarSpacing + nameBarAttachmentOffset - 0.5*yieldDescHeights[0]);
      if (reportAttachmentOffset) {
        reportAttachmentOffset(nameBarSpacing + nameBarAttachmentOffset);
      }
    } else if (yieldLabels.length > 0) {
      if (!yieldLabelsRef.current) {
        throw new Error();
      }
      const yieldLabelElems = childrenToArr(yieldLabelsRef.current);

      let leftY = 0;
      let rightY = nameBarSpacing + nameBarHeight;

      yieldDescHeights.forEach((yieldDescHeight, idx) => {
        const yieldLabelHeight = getHeight(yieldLabelElems[idx]);

        const spacing = (idx > 0) ? SPACING : 0;
        const diff = (rightY + 0.5*yieldLabelHeight) - (leftY + 0.5*yieldDescHeight);
        if (diff > 0) {
          setTopMargin(yieldDescElems[idx], diff+spacing);
          setTopMargin(yieldLabelElems[idx], spacing);
          leftY += yieldDescHeight + diff + spacing;
          rightY += yieldLabelHeight + spacing;
        } else {
          setTopMargin(yieldDescElems[idx], spacing);
          setTopMargin(yieldLabelElems[idx], -diff + spacing);
          leftY += yieldDescHeight + spacing;
          rightY += yieldLabelHeight - diff + spacing;
        }

        if (idx === retIdx) {
          if (reportAttachmentOffset) {
            reportAttachmentOffset(leftY - 0.5*yieldDescHeight);
          }
        }
      });
    }

    if (streamChildAtBar) {
      setTopMargin(streamChildElems[0], nameBarSpacing + nameBarAttachmentOffset - streamChildAttachmentOffsets[0]);
    } else if (streamArgs.length > 0) {
      if (!streamLabelsRef.current) {
        throw new Error();
      }
      const streamLabelElems = childrenToArr(streamLabelsRef.current);

      let leftY = nameBarSpacing + nameBarHeight;
      let rightY = 0;

      streamChildrenHeights.forEach((streamChildHeight, idx) => {
        const streamLabelHeight = getHeight(streamLabelElems[idx]);

        const spacing = (idx > 0) ? SPACING : 0;
        const diff = (rightY + streamChildAttachmentOffsets[idx]) - (leftY + 0.5*streamLabelHeight);
        if (diff > 0) {
          setTopMargin(streamLabelElems[idx], diff+spacing);
          setTopMargin(streamChildElems[idx], spacing);
          leftY += streamLabelHeight + diff + spacing;
          rightY += streamChildHeight + spacing;
        } else {
          setTopMargin(streamLabelElems[idx], spacing);
          setTopMargin(streamChildElems[idx], -diff + spacing);
          leftY += streamLabelHeight + spacing;
          rightY += streamChildHeight - diff + spacing;
        }
      });
    }
  });

  const {classes: selectionClasses, handlers: selectionHandlers} = useSelectable(node);

  const handleReportAttachmentOffset = (offset: number, idx: number): void => {
    const rand = Math.random();
    setReportedStreamChildAttachmentOffsets(st => {
      if (st[idx] === offset) {
        return st;
      }
      const newSt = [...st];
      newSt[idx] = offset;
      return newSt;
    });
  };

  return (
    <div className="TreeView-appish-node">
      <div className="TreeView-appish-left-margin" />
      <div className="TreeView-appish-yield-descs" ref={yieldDescsRef}>{yields.map((y, idx) => (
        <div style={{display: 'flex'}}>
          <div style={{flex: '1 0 auto', minHeight: '1px', display: 'flex', flexDirection: 'column', minWidth: connected ? CXN_MIN_LENGTH : 0}}> {/* takes up extra space */}
            {(idx === retIdx) &&
              <>
                <div style={{flex: '1'}} />
                <div style={{flex: '0 0 1px', background: CXN_COLOR}} />
                <div style={{flex: '1'}} />
              </>
            }
          </div>
          {y.node && <DescriptionNodeView node={y.node} />}
        </div>
      ))}</div>
      <div>
        <div className={selectionClasses.join(' ')} {...selectionHandlers}>
          <div className="TreeView-name-bar TreeView-common-padding" ref={nameBarRef}>{name}</div>
          {((streamLabels.length > 0) || (yieldLabels.length > 0)) &&
            <div className="TreeView-appish-body">
              <div ref={yieldLabelsRef}>{yieldLabels.map(ylabel => (
                <div className="TreeView-common-padding">{ylabel}</div>
              ))}</div>
              <div style={{textAlign: 'right', flex: '1'}} ref={streamLabelsRef}>
                {streamLabels.map(slabel => (
                  <div className="TreeView-common-padding">{slabel || <span>&nbsp;</span>}</div>
                ))}
              </div>
            </div>
          }
        </div>
      </div>
      <div className="TreeView-appish-node-stream-children" ref={streamChildrenRef}>{streamArgs.map(({node}, idx) => (
        <StreamExpressionView node={node} connected={true} reportAttachmentOffset={offset => { handleReportAttachmentOffset(offset, idx); }} />
      ))}</div>
    </div>
  );
};

const StreamExpressionView: React.FC<{node: StreamExpressionNode, connected: boolean, reportAttachmentOffset?: (offset: number) => void}> = ({ node, connected, reportAttachmentOffset }) => {
  const ctxData = useContext(TreeViewContext);
  if (!ctxData) {
    throw new Error();
  }

  const {classes: selectionClasses, handlers: selectionHandlers} = useSelectable(node);

  const nodeView: JSX.Element = (() => {
    switch (node.kind) {
      case NodeKind.UndefinedLiteral:
        return <ChildlessStreamNodeView node={node} contents={<span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>} boxColor={'red'} connected={connected} reportAttachmentOffset={reportAttachmentOffset} />

      case NodeKind.NumberLiteral:
        return <ChildlessStreamNodeView node={node} contents={node.val.toString()} boxColor="#cce8cc" connected={connected} reportAttachmentOffset={reportAttachmentOffset} />

      case NodeKind.ArrayLiteral:
        return <AppishNodeView node={node} name="[ ]" boxColor={NORMAL_BOX_COLOR} streamArgs={node.elems.map((elem, idx) => ({key: idx, name: undefined, node: elem}))} functionArgs={[]} yields={[]} retIdx={0} connected={connected} reportAttachmentOffset={reportAttachmentOffset} />

      case NodeKind.Application: {
        if (node.func.kind !== NodeKind.FunctionReference) {
          throw new Error('unimplemented');
        }

        const nearestDef = ctxData.envLookups.nodeToNearestTreeDef.get(node);
        if (!nearestDef) {
          throw new Error();
        }
        const nodeFunctionEnv = ctxData.envLookups.treeDefToFunctionEnv.get(nearestDef);
        if (!nodeFunctionEnv) {
          throw new Error();
        }
        const functionNode = nodeFunctionEnv.get(node.func.ref);
        if (!functionNode) {
          throw new Error();
        }
        const displayedDesc = functionNode.desc ? functionNode.desc.text : ('<function ' + node.func + '>');

        if (functionNode.sig.streamParams.length !== node.sargs.length) {
          throw new Error('stream params and args length mismatch');
        }
        if (functionNode.sig.funcParams.length !== node.fargs.length) {
          throw new Error('function params and args length mismatch');
        }

        const streamChildrenViews: Array<AppishNodeChild<StreamExpressionNode>> = functionNode.sig.streamParams.map((param, idx) => {
          const displayName = (param.desc && !param.desc.text.startsWith('_')) ? param.desc.text : undefined;
          return {
            key: idx,
            name: displayName,
            node: node.sargs[idx],
          };
        });

        const functionChildrenViews: Array<AppishNodeChild<FunctionDefinitionNode>> = functionNode.sig.funcParams.map((param, idx) => {
          const farg = node.fargs[idx];
          if (farg.kind !== NodeKind.TreeFunctionDefinition) {
            throw new Error('not yet supported');
          }
          const displayName = (param.desc && param.desc.text) || undefined;
          return {
            key: idx,
            name: displayName,
            node: farg,
          };
        });

        const yields: Array<AppishNodeChild<DescriptionNode | undefined>> = functionNode.sig.yields.map((sigYieldNode, idx) => {
          const displayName = (sigYieldNode.desc && sigYieldNode.desc.text) || undefined;
          return {
            key: idx,
            name: displayName,
            node: node.dsids[idx].desc,
          };
        });

        return <AppishNodeView node={node} name={displayedDesc} boxColor={NORMAL_BOX_COLOR} streamArgs={streamChildrenViews} functionArgs={functionChildrenViews} yields={yields} retIdx={node.reti} connected={connected} reportAttachmentOffset={reportAttachmentOffset} />
      }

      case NodeKind.StreamReference:
        return <StreamReferenceView node={node} connected={connected} reportAttachmentOffset={reportAttachmentOffset} />

      default: {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
        throw new Error();
      }
    }
  })();

  const selected = (ctxData.selectedNode === node);
  if (selected && ctxData.editing) {
    return (
      <div style={{position: 'relative'}}>
        {nodeView}
        <div style={{position: 'absolute', top: 0}}><ExpressionChooser initNode={node} envLookups={ctxData.envLookups} dispatch={ctxData.dispatch} /></div>
      </div>
    );
  } else {
    return nodeView;
  }
}

const BodyExpressionView: React.FC<{node: BodyExpressionNode}> = ({node}) => {
  if (isStreamExpressionNode(node)) {
    return <StreamExpressionView node={node} connected={false} />
  } else if (isFunctionExpressionNode(node)) {
    throw new Error('unimplemented');
  } else if (node.kind === NodeKind.YieldExpression) {
    return <div style={{marginLeft: '-0.5em'}}><SingleChildNodeView node={node} contents={'yield ' + node.idx} boxColor={'#d5bce4'} child={<StreamExpressionView node={node.expr} connected={true} />} /></div>
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
    throw new Error('unreachable');
  }
};

const TreeFunctionBodyView: React.FC<{node: TreeFunctionBodyNode}> = ({ node }) => {
  const {classes: selectionClasses, handlers: selectionHandlers} = useSelectable(node);

  return (
    <div className={selectionClasses.concat(['TreeView-udf-node-expressions']).join(' ')} {...selectionHandlers}>{node.exprs.map(expr => (
      <BodyExpressionView node={expr} />
    ))}</div>
  );
}

export const TreeFunctionDefinitionView: React.FC<{node: TreeFunctionDefinitionNode}> = ({ node }) => {
  const {classes: selectionClasses, handlers: selectionHandlers} = useSelectable(node);

  return (
    <div className={selectionClasses.concat(['TreeView-udf-node']).join(' ')} {...selectionHandlers} style={{backgroundColor: NORMAL_BOX_COLOR}}>
      {node.desc && <div className="TreeView-name-bar TreeView-common-padding">{node.desc.text}</div>}
      <div className="TreeView-udf-node-main-container">
        <TreeFunctionBodyView node={node.body} />
      </div>
    </div>
  );
};

const FunctionDefinitionView: React.FC<{node: FunctionDefinitionNode}> = ({ node }) => {
  if (node.kind === NodeKind.TreeFunctionDefinition) {
    return <TreeFunctionDefinitionView node={node} />
  } else if (node.kind === NodeKind.NativeFunctionDefinition) {
    throw new Error('unimplemented');
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
    throw new Error('unreachable');
  }
};

const FunctionExpressionView: React.FC<{node: FunctionExpressionNode}> = ({ node }) => {
  if (node.kind === NodeKind.FunctionReference) {
    throw new Error('unimplemented');
  } else if (isFunctionDefinitionNode(node)) {
    return <FunctionDefinitionView node={node} />
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
    throw new Error('unreachable');
  }
};
