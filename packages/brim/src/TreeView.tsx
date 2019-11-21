import React, { createContext, useContext, useState } from 'react';
import { StreamID, FunctionID, Node, FunctionDefinitionNode, TreeFunctionDefinitionNode, StreamExpressionNode, BodyExpressionNode, NodeKind, isStreamExpressionNode, isFunctionExpressionNode } from './Tree';
// import ExpressionChooser from './ExpressionChooser';
import './TreeView.css';
import { State } from './State';

const NORMAL_BOX_COLOR = '#d8d8d8';
const STREAM_REFERENCE_BOX_COLOR = '#ccd9e8';
const STREAM_INDIRECTION_BOX_COLOR = '#8cbcf2';

export interface TreeViewContextData {
  selectedNode: Node,
  // streamIdToNode: ReadonlyMap<StreamID, StreamDefinitionNode>;
  functionIdToDef: ReadonlyMap<FunctionID, FunctionDefinitionNode>;
  mainState: State;
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

const AppishNodeView: React.FC<AppishNodeProps> = ({node, name, boxColor, streamChildren, functionChildren}) => {
  const {classes: selectionClasses, handlers: selectionHandlers} = useSelectable(node);

  const rowsForArray = (a: ReadonlyArray<any>): number => (a.length === 0) ? 0 : (2*a.length - 1);

  const totalRows = 1 + rowsForArray(streamChildren) + rowsForArray(functionChildren);
  return (
    <div className="TreeView-appish-node">
      <div className={selectionClasses.join(' ')} style={{gridRowStart: 1, gridRowEnd: totalRows+1, gridColumnStart: 1, gridColumnEnd: 2, background: boxColor }} {...selectionHandlers} />
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
          <div className="TreeView-appish-node-function-argument" style={{gridRow: 1 + rowsForArray(streamChildren) + 2*idx+1, gridColumn: 1}}><div className="TreeView-appish-node-function-argument-inner">{child}</div></div>
        </React.Fragment>
      ))}</>
      {/* <div className={selectionClasses.concat(['TreeView-appish-node-selection-overlay']).join(' ')} style={{gridRowStart: 1, gridRowEnd: totalRows+1, gridColumnStart: 1, gridColumnEnd: 2}} {...selectionHandlers} /> */}
    </div>
  );
};

const StreamExpressionView: React.FC<{node: StreamExpressionNode}> = ({ node }) => {
  const ctxData = useContext(TreeViewContext);
  if (!ctxData) {
    throw new Error();
  }

  const selected = (ctxData.selectedNode === node);

  if (selected && ctxData.mainState.editingSelected) {
    // return <ExpressionChooser mainState={ctxData.mainState} dispatch={ctxData.dispatch} />
    return <div>chooser goes here</div>
  }

  switch (node.kind) {
    case NodeKind.UndefinedLiteral:
      return <SimpleNodeView node={node} contents={<span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>} boxColor={'red'} />

    case NodeKind.NumberLiteral:
      return <SimpleNodeView node={node} contents={node.val.toString()} boxColor="#cce8cc" />

    case NodeKind.ArrayLiteral:
      return <AppishNodeView node={node} name="[ ]" boxColor={NORMAL_BOX_COLOR} streamChildren={node.elems.map((elem, idx) => ({key: idx, name: undefined, child: <StreamExpressionView node={elem} />}))} functionChildren={[]} />

    case NodeKind.RefApplication: {
      const functionNode = ctxData.functionIdToDef.get(node.func);
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

      /*
      const functionChildrenViews: Array<ChildView> = functionNode.sig.funcParams.map((param, idx) => {
        const displayName = (param.desc && param.desc.text) || undefined;
        return {
          key: idx,
          name: displayName,
          child: <TreeFunctionDefinitionView node={node.fargs[idx]} inheritedName={displayName} />
        };
      });
      */
     const functionChildrenViews: Array<ChildView> = [];

      return <AppishNodeView node={node} name={displayedDesc} boxColor={NORMAL_BOX_COLOR} streamChildren={streamChildrenViews} functionChildren={functionChildrenViews} />
    }

    case NodeKind.StreamReference: {
      // const targetExpressionNode = ctxData.streamIdToNode.get(node.ref);
      // if (!targetExpressionNode) {
      //   throw new Error();
      // }
      // const displayedDesc = ('desc' in targetExpressionNode) ? targetExpressionNode.desc : ('<stream ' + node.ref + '>');
      const displayedDesc = 'ref';
      return <SimpleNodeView node={node} contents={displayedDesc} boxColor={STREAM_REFERENCE_BOX_COLOR} />
    }

    default:
      throw new Error();
  }
  return (
    <div></div>
  );
}

export const BodyExpressionView: React.FC<{node: BodyExpressionNode}> = ({node}) => {
  if (isStreamExpressionNode(node)) {
    return <StreamExpressionView node={node} />
  } else if (isFunctionExpressionNode(node)) {
    throw new Error('unimplemented');
  } else if (node.kind === NodeKind.YieldExpression) {
    throw new Error('unimplemented');
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
    throw new Error('unreachable');
  }
};

export const TreeFunctionDefinitionView: React.FC<{node: TreeFunctionDefinitionNode, inheritedName?: string}> = ({ node, inheritedName }) => {
  const {classes: selectionClasses, handlers: selectionHandlers} = useSelectable(node);

  return (
    <div className={selectionClasses.concat(['TreeView-udf-node']).join(' ')} {...selectionHandlers} style={{backgroundColor: NORMAL_BOX_COLOR}}>
      <div className="TreeView-name-bar TreeView-common-padding">{node.desc || (inheritedName || 'ƒ')}</div>
      <div className="TreeView-udf-node-main-container TreeView-common-padding">
        <div className="TreeView-udf-node-expressions">{node.exprs.map(expr => (
          <BodyExpressionView node={expr} />
        ))}</div>
      </div>
    </div>
  );
};

export const FunctionDefinitionView: React.FC<{node: FunctionDefinitionNode, inheritedName?: string}> = ({ node, inheritedName }) => {
  if (node.kind === NodeKind.TreeFunctionDefinition) {
    return <TreeFunctionDefinitionView node={node} inheritedName={inheritedName} />
  } else if (node.kind === NodeKind.NativeFunctionDefinition) {
    throw new Error('unimplemented');
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
    throw new Error('unreachable');
  }
};

/*
export const NodeView: React.FC<{node: Node, inheritedName?: string}> = ({ node, inheritedName }) => {
  const ctxData = useContext(TreeViewContext);
  if (!ctxData) {
    throw new Error();
  }

  const children: ReadonlyArray<Node> = node.children; // to get type right
  const selected = (ctxData.selectedNode === node);

  if (selected && ctxData.mainState.editingSelected) {
    return <ExpressionChooser mainState={ctxData.mainState} dispatch={ctxData.dispatch} />
  }

  const makeAnonChildrenViews = () => children.map((child, idx) => ({
    key: idx,
    name: undefined,
    child: <NodeView node={child} />
  }));

  switch (node.type) {
    case 'UndefinedLiteral':
      return <SimpleNodeView node={node} contents={<span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>} boxColor={'red'} />

    case 'NumberLiteral':
      return <SimpleNodeView node={node} contents={node.value.toString()} boxColor="#cce8cc" />

    case 'ArrayLiteral':
      return <AppishNodeView node={node} name="[ ]" boxColor={NORMAL_BOX_COLOR} streamChildren={makeAnonChildrenViews()} functionChildren={[]} />

    case 'Application': {
      const functionNode = ctxData.functionIdToNode.get(node.functionId);
      if (!functionNode) {
        throw new Error();
      }
      const displayedName = functionNode.name ? functionNode.name : ('<function ' + node.functionId + '>');

      if (functionNode.signature.parameters.length !== node.children.length) {
        throw new Error('params and args length mismatch');
      }

      const streamChildrenViews: Array<ChildView> = [];
      const functionChildrenViews: Array<ChildView> = [];
      functionNode.signature.parameters.forEach((param, idx) => {
        const displayName = param.name.startsWith('_') ? undefined : param.name;
        const childView = {
          key: param.name,
          name: displayName,
          child: <NodeView node={node.children[idx]} inheritedName={displayName} />
        };
        if (param.type === 'stream') {
          streamChildrenViews.push(childView);
        } else {
          functionChildrenViews.push(childView);
        }
      });

      return <AppishNodeView node={node} name={displayedName} boxColor={NORMAL_BOX_COLOR} streamChildren={streamChildrenViews} functionChildren={functionChildrenViews} />
    }

    case 'StreamReference': {
      const targetExpressionNode = ctxData.streamIdToNode.get(node.targetStreamId);
      if (!targetExpressionNode) {
        throw new Error();
      }
      const displayedDesc = ('desc' in targetExpressionNode) ? targetExpressionNode.desc : ('<stream ' + node.targetStreamId + '>');
      return <SimpleNodeView node={node} contents={displayedDesc} boxColor={STREAM_REFERENCE_BOX_COLOR} />
    }

    case 'StreamParameter':
      return <SimpleNodeView node={node} contents={'?'} boxColor={'transparent'} />

    case 'TreeFunctionDefinition':
      return <TreeFunctionDefinitionView node={node} inheritedName={inheritedName} />

    default:
      throw new Error();
  }
}
*/
