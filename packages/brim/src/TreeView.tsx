import React, { createContext, useContext, useState, useRef, RefObject, useLayoutEffect } from 'react';
import { Node, NameNode, FunctionDefinitionNode, TreeFunctionDefinitionNode, StreamExpressionNode, BodyExpressionNode, NodeKind, isStreamExpressionNode, isFunctionExpressionNode, TreeFunctionBodyNode, FunctionExpressionNode, isFunctionDefinitionNode, UndefinedLiteralNode, NumberLiteralNode, StreamReferenceNode } from './Tree';
import ExpressionChooser from './ExpressionChooser';
import './TreeView.css';
import { EnvironmentLookups } from './EditReducer';

const NORMAL_BOX_COLOR = '#d8d8d8';
const STREAM_REFERENCE_BOX_COLOR = '#a1cdff';

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
const CXN_LENGTH = '0.35em';

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

const NameNodeView: React.FC<{node: NameNode, reportAttachmentOffset?: (offset: number) => void}> = ({node, reportAttachmentOffset}) => {
  const {classes: selectionClasses, handlers: selectionHandlers} = useSelectable(node);
  const ref = useReportSimpleAttachmentOffset(reportAttachmentOffset);
  return (
    <div ref={ref} className={selectionClasses.concat(['TreeView-simple-node', 'TreeView-common-padding']).join(' ')} {...selectionHandlers}>{node.text}&nbsp;=</div>
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

const ChildlessStreamNodeView: React.FC<{node: UndefinedLiteralNode | NumberLiteralNode, contents: React.ReactNode, boxColor: string, reportAttachmentOffset?: (offset: number) => void}> = ({node, contents, boxColor, reportAttachmentOffset}) => {
  const {classes: selectionClasses, handlers: selectionHandlers} = useSelectable(node);
  const ref = useReportSimpleAttachmentOffset(reportAttachmentOffset);

  return (
    <div ref={ref} className={selectionClasses.concat(['TreeView-simple-node', 'TreeView-common-padding']).join(' ')} {...selectionHandlers} style={{background: boxColor}}>{contents}</div>
  );
};

const StreamReferenceView: React.FC<{node: StreamReferenceNode, reportAttachmentOffset?: (offset: number) => void}> = ({node, reportAttachmentOffset}) => {
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

  const displayedName: string = streamDef.name || ('<stream ' + node.ref + '>');

  return (
    <div ref={ref} className={selectionClasses.concat(['TreeView-simple-node', 'TreeView-common-padding']).join(' ')} {...selectionHandlers} style={{background: STREAM_REFERENCE_BOX_COLOR}}>{displayedName}</div>
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
  topBarExtraClasses: ReadonlyArray<string>;
  streamArgs: ReadonlyArray<AppishNodeChild<StreamExpressionNode>>;
  functionArgs: ReadonlyArray<AppishNodeChild<FunctionDefinitionNode>>;
  yields: ReadonlyArray<string | undefined>;
  retIdx: number; // which yield is connected to parent
  reportAttachmentOffset?: (offset: number) => void;
}

const AppishNodeView: React.FC<AppishNodeProps> = ({node, name, topBarExtraClasses, streamArgs, functionArgs, yields, retIdx, reportAttachmentOffset}) => {
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
  if ((yields.length === 1) && (yields[0] === undefined)) {
    yieldAtBar = true;
    yieldLabels = [];
  } else {
    yieldAtBar = false;
    yieldLabels = yields;
  }

  const rootRef = useRef<HTMLDivElement>(null);
  const nameBarRef = useRef<HTMLDivElement>(null);
  const yieldLabelsRef = useRef<HTMLDivElement>(null);
  const streamLabelsRef = useRef<HTMLDivElement>(null);
  const streamCxnsRef = useRef<HTMLDivElement>(null);
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

    if (!rootRef.current || !nameBarRef.current || !streamChildrenRef.current || !streamCxnsRef.current) {
      throw new Error();
    }
    const streamCxnElems = childrenToArr(streamCxnsRef.current);
    const streamChildElems = childrenToArr(streamChildrenRef.current);

    const nameBarHeight = getHeight(nameBarRef.current);
    const nameBarAttachmentOffset = 0.5*nameBarHeight;

    const streamChildrenHeights = streamChildElems.map(elem => getHeight(elem));
    const streamChildAttachmentOffsets = streamChildrenHeights.map((_, idx) => reportedStreamChildAttachmentOffsets[idx] || 0);

    const streamChildAtBarMinAttachmentOffset = streamChildAtBar ? streamChildAttachmentOffsets[0] : 0;
    const nameBarSpacing = Math.max(streamChildAtBarMinAttachmentOffset - nameBarAttachmentOffset, 0);

    setTopMargin(nameBarRef.current, nameBarSpacing);

    if (reportAttachmentOffset) {
      if (yieldAtBar) {
        reportAttachmentOffset(nameBarSpacing + nameBarAttachmentOffset);
      } else if (yieldLabels.length > 0) {
        if (!yieldLabelsRef.current) {
          throw new Error();
        }
        const yieldLabelElems = childrenToArr(yieldLabelsRef.current);
        const returnedLabel = yieldLabelElems[retIdx];
        const returnedLabelRect = returnedLabel.getBoundingClientRect();

        reportAttachmentOffset(0.5*(returnedLabelRect.top + returnedLabelRect.bottom) - rootRef.current.getBoundingClientRect().top);
      }
    }

    const SPACING = 5;

    if (streamChildAtBar) {
      setTopMargin(streamChildElems[0], nameBarSpacing + nameBarAttachmentOffset - streamChildAttachmentOffsets[0]);
      streamCxnElems[0].style.top = (nameBarSpacing + nameBarAttachmentOffset) + 'px';
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
        streamCxnElems[idx].style.top = (leftY - 0.5*streamLabelHeight) + 'px';
      });
    }
  });

  const {classes: selectionClasses, handlers: selectionHandlers} = useSelectable(node);

  const handleReportAttachmentOffset = (offset: number, idx: number): void => {
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
    <div ref={rootRef} className="TreeView-appish-node">
      <div>
        <div className={selectionClasses.join(' ')} {...selectionHandlers}>
          <div className={topBarExtraClasses.concat(['TreeView-appish-top-bar', 'TreeView-common-padding']).join(' ')} ref={nameBarRef}>{name}</div>
          {((streamLabels.length > 0) || (yieldLabels.length > 0) || (functionArgs.length > 0)) &&
            <div className="TreeView-appish-body">
              <div className="TreeView-appish-body-stream-area">
                <div ref={yieldLabelsRef}>{yieldLabels.map(ylabel => (
                  <div className="TreeView-common-padding">{ylabel}</div>
                ))}</div>
                <div style={{textAlign: 'right', flex: '1'}} ref={streamLabelsRef}>
                  {streamLabels.map(slabel => (
                    <div className="TreeView-common-padding">{slabel || <span>&nbsp;</span>}</div>
                  ))}
                </div>
              </div>
              <div>{functionArgs.map((farg, idx) => (
                <div key={idx} className="TreeView-common-padding" style={{paddingBottom: '0.2em'}}>
                  {farg.name}
                  <FunctionExpressionView node={farg.node} />
                </div>
              ))}
              </div>
            </div>
          }
        </div>
      </div>
      <div ref={streamCxnsRef} style={{position: 'relative', width: CXN_LENGTH}}>{streamArgs.map((_, idx) => (
        <div key={idx} style={{width: CXN_LENGTH, height: '1px', background: CXN_COLOR, position: 'absolute'}} />
      ))}</div>
      <div className="TreeView-appish-node-stream-children" ref={streamChildrenRef}>{streamArgs.map(({node}, idx) => (
        <StreamExpressionView node={node} reportAttachmentOffset={offset => { handleReportAttachmentOffset(offset, idx); }} />
      ))}</div>
    </div>
  );
};

const StreamExpressionView: React.FC<{node: StreamExpressionNode, reportAttachmentOffset?: (offset: number) => void}> = ({ node, reportAttachmentOffset }) => {
  const ctxData = useContext(TreeViewContext);
  if (!ctxData) {
    throw new Error();
  }

  const nodeView: JSX.Element = (() => {
    switch (node.kind) {
      case NodeKind.UndefinedLiteral:
        return <ChildlessStreamNodeView node={node} contents={<span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>} boxColor={'red'} reportAttachmentOffset={reportAttachmentOffset} />

      case NodeKind.NumberLiteral:
        return <ChildlessStreamNodeView node={node} contents={node.val.toString()} boxColor="#cce8cc" reportAttachmentOffset={reportAttachmentOffset} />

      case NodeKind.ArrayLiteral:
        return <AppishNodeView node={node} name="[ ]" topBarExtraClasses={['TreeView-application-top-bar']} streamArgs={node.elems.map((elem, idx) => ({key: idx, name: idx.toString(), node: elem}))} functionArgs={[]} yields={[undefined]} retIdx={0} reportAttachmentOffset={reportAttachmentOffset} />

      case NodeKind.StreamIndirection: {
        const displayedName = node.name || <span>&nbsp;&nbsp;&nbsp;</span>;
        return <AppishNodeView node={node} name={displayedName} topBarExtraClasses={['TreeView-stream-indirection-bar']} streamArgs={[{key: 0, name: undefined, node: node.expr}]} functionArgs={[]} yields={[undefined]} retIdx={0} reportAttachmentOffset={reportAttachmentOffset} />
      }

      case NodeKind.StreamReference:
        return <StreamReferenceView node={node} reportAttachmentOffset={reportAttachmentOffset} />

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
        const displayedName = functionNode.name ? functionNode.name.text : ('<function ' + node.func + '>');

        if (functionNode.sig.streamParams.length !== node.sargs.length) {
          throw new Error('stream params and args length mismatch');
        }
        if (functionNode.sig.funcParams.length !== node.fargs.length) {
          throw new Error('function params and args length mismatch');
        }

        const streamChildrenViews: Array<AppishNodeChild<StreamExpressionNode>> = functionNode.sig.streamParams.map((param, idx) => {
          const displayName = (param.name && !param.name.text.startsWith('_')) ? param.name.text : undefined;
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
          const displayName = (param.name && param.name.text) || undefined;
          return {
            key: idx,
            name: displayName,
            node: farg,
          };
        });

        const yields: ReadonlyArray<string | undefined> = functionNode.sig.yields.map(sigYieldNode => (sigYieldNode.name && sigYieldNode.name.text) || undefined);

        return <AppishNodeView node={node} name={displayedName} topBarExtraClasses={['TreeView-application-top-bar']} streamArgs={streamChildrenViews} functionArgs={functionChildrenViews} yields={yields} retIdx={node.reti} reportAttachmentOffset={reportAttachmentOffset} />
      }

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
    return <StreamExpressionView node={node} />
  } else if (isFunctionExpressionNode(node)) {
    throw new Error('unimplemented');
  } else if (node.kind === NodeKind.YieldExpression) {
    return (
      <div style={{marginLeft: '-0.5em'}}>
        <AppishNodeView node={node} name={'yield ' + node.idx} topBarExtraClasses={['TreeView-yield-bar']} streamArgs={[{key: 0, name: undefined, node: node.expr}]} functionArgs={[]} yields={[undefined]} retIdx={0} />
      </div>
    );
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
      {node.name && <div className="TreeView-name-bar TreeView-common-padding">{node.name.text}</div>}
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
