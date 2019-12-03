import React, { createContext, useContext, useState } from 'react';
import { StreamID, FunctionID, Node, FunctionDefinitionNode, TreeFunctionDefinitionNode, StreamExpressionNode, BodyExpressionNode, NodeKind, isStreamExpressionNode, isFunctionExpressionNode, TreeFunctionBodyNode, FunctionExpressionNode, isFunctionDefinitionNode } from './Tree';
import ExpressionChooser from './ExpressionChooser';
import './TreeView.css';
import { EnvironmentLookups } from './EditReducer';

const NORMAL_BOX_COLOR = '#d8d8d8';
const STREAM_REFERENCE_BOX_COLOR = '#ccd9e8';

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

interface ChildView {
  key: string | number | undefined;
  name: string | undefined;
  child: React.ReactNode;
}

interface AppishNodeProps {
  node: Node | null;
  name: React.ReactNode;
  boxColor: string;
  streamChildren: ReadonlyArray<ChildView>;
  functionChildren: ReadonlyArray<ChildView>;
}

const SimpleNodeView: React.FC<{node: Node, contents: React.ReactNode, boxColor: string}> = ({node, contents, boxColor}) => {
  const {classes: selectionClasses, handlers: selectionHandlers} = useSelectable(node);

  return (
    <div className={selectionClasses.concat(['TreeView-simple-node', 'TreeView-common-padding']).join(' ')} {...selectionHandlers} style={{background: boxColor}}>{contents}</div>
  );
};

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

const AppishNodeView: React.FC<AppishNodeProps> = ({node, name, boxColor, streamChildren, functionChildren}) => {
  const {classes: selectionClasses, handlers: selectionHandlers} = useSelectable(node);

  const rowsForArray = (a: ReadonlyArray<any>): number => (a.length === 0) ? 0 : (2*a.length - 1);

  const totalRows = 1 + rowsForArray(streamChildren) + rowsForArray(functionChildren);
  return (
    <div className="TreeView-appish-node">
      <div style={{gridRowStart: 1, gridRowEnd: totalRows+1, gridColumnStart: 1, gridColumnEnd: 2, background: boxColor }} {...selectionHandlers} />
      <div className="TreeView-name-bar TreeView-common-padding" style={{gridRow: 1, gridColumn: 1}}>{name}</div>
      <>{streamChildren.map(({key, name, child}, idx) => (
        <React.Fragment key={key}>
          {(idx > 0) ? (
            <div className="TreeView-appish-node-spacer-row" style={{gridRow: 1 + 2*idx, gridColumnStart: 1, gridColumnEnd: 5}} />
          ) : null}
          <div className="TreeView-appish-node-child-name TreeView-common-padding" style={{gridRow: 2*idx+2, gridColumn: 1}}>{name}</div>
          <div className="TreeView-appish-node-child-cxn-triangle" style={{gridRow: 1 + 2*idx + 1, gridColumn: 2}}><div /></div>
          <div className="TreeView-appish-node-child-subtree" style={{gridRow: 1 + 2*idx + 1, gridColumn: 3}}>{child}</div>
        </React.Fragment>
      ))}</>
      <>{functionChildren.map(({key, name, child}, idx) => (
        <React.Fragment key={key}>
          {(idx > 0) ? (
            <div className="TreeView-appish-node-spacer-row" style={{gridRow: 1 + rowsForArray(streamChildren) + 2*idx, gridColumnStart: 1, gridColumnEnd: 5}} />
          ) : null}
          <div className="TreeView-common-padding" style={{gridRow: 1 + rowsForArray(streamChildren) + 2*idx+1, gridColumn: 1}}>
            <div className="TreeView-appish-node-child-name">{name}</div>
            <div className="TreeView-appish-node-function-argument-inner">{child}</div>
          </div>
        </React.Fragment>
      ))}</>
      <div className={selectionClasses.concat(['TreeView-appish-node-selection-overlay']).join(' ')} style={{gridRowStart: 1, gridRowEnd: totalRows+1, gridColumnStart: 1, gridColumnEnd: 2}} />
    </div>
  );
};

const StreamExpressionView: React.FC<{node: StreamExpressionNode}> = ({ node }) => {
  const ctxData = useContext(TreeViewContext);
  if (!ctxData) {
    throw new Error();
  }

  const nodeView: JSX.Element = (() => {
    switch (node.kind) {
      case NodeKind.UndefinedLiteral:
        return <SimpleNodeView node={node} contents={<span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>} boxColor={'red'} />

      case NodeKind.NumberLiteral:
        return <SimpleNodeView node={node} contents={node.val.toString()} boxColor="#cce8cc" />

      case NodeKind.ArrayLiteral:
        return <AppishNodeView node={node} name="[ ]" boxColor={NORMAL_BOX_COLOR} streamChildren={node.elems.map((elem, idx) => ({key: idx, name: undefined, child: <StreamExpressionView node={elem} />}))} functionChildren={[]} />

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

        const streamChildrenViews: Array<ChildView> = functionNode.sig.streamParams.map((param, idx) => {
          const displayName = (param.desc && !param.desc.text.startsWith('_')) ? param.desc.text : undefined;
          return {
            key: idx,
            name: displayName,
            child: <StreamExpressionView node={node.sargs[idx]} />
          };
        });

        const functionChildrenViews: Array<ChildView> = functionNode.sig.funcParams.map((param, idx) => {
          const farg = node.fargs[idx];
          if (farg.kind !== NodeKind.TreeFunctionDefinition) {
            throw new Error('not yet supported');
          }
          const displayName = (param.desc && param.desc.text) || undefined;
          return {
            key: idx,
            name: displayName,
            child: <TreeFunctionDefinitionView node={farg} />
          };
        });

        return <AppishNodeView node={node} name={displayedDesc} boxColor={NORMAL_BOX_COLOR} streamChildren={streamChildrenViews} functionChildren={functionChildrenViews} />
      }

      case NodeKind.StreamReference: {
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
        return <SimpleNodeView node={node} contents={displayedDesc} boxColor={STREAM_REFERENCE_BOX_COLOR} />
      }

      default:
        throw new Error();
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
    return <div style={{marginLeft: '-0.5em'}}><SingleChildNodeView node={node} contents={'yield ' + node.idx} boxColor={'#d5bce4'} child={<StreamExpressionView node={node.expr} />} /></div>
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
