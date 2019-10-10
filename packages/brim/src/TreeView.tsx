import React, { createContext, useContext, useState } from 'react';
import { Node, StreamCreationNode, FunctionDefinitionNode, isNamedNode, UserFunctionDefinitionNode } from './Tree';
import ExpressionChooser from './ExpressionChooser';
import './TreeView.css';
import { StreamID, FunctionID } from './Identifier';
import { State } from './State';

const NORMAL_BOX_COLOR = '#d8d8d8';
const STREAM_NAMEISH_BOX_COLOR = '#ccd9e8';

export interface TreeViewContextData {
  selectedNode: Node,
  streamIdToNode: ReadonlyMap<StreamID, StreamCreationNode>;
  functionIdToNode: ReadonlyMap<FunctionID, FunctionDefinitionNode>;
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
  name: string | null;
  child: React.ReactNode;
}

interface AppishNodeProps {
  node: Node | null;
  mainText: React.ReactNode;
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

const AppishNodeView: React.FC<AppishNodeProps> = ({node, mainText, boxColor, streamChildren, functionChildren}) => {
  const {classes: selectionClasses, handlers: selectionHandlers} = useSelectable(node);

  const rowsForArray = (a: ReadonlyArray<any>): number => (a.length === 0) ? 0 : (2*a.length - 1);

  const totalRows = 1 + rowsForArray(streamChildren) + rowsForArray(functionChildren);
  return (
    <div className="TreeView-appish-node">
      <div className={selectionClasses.join(' ')} style={{gridRowStart: 1, gridRowEnd: totalRows+1, gridColumnStart: 1, gridColumnEnd: 2, background: boxColor }} {...selectionHandlers} />
      <div className="TreeView-name-bar TreeView-common-padding" style={{gridRow: 1, gridColumn: 1}}>{mainText}</div>
      <>{streamChildren.map(({key, name, child}, idx) => (
        <React.Fragment key={key}>
          {(idx > 0) ? (
            <div className="TreeView-appish-node-spacer-row" style={{gridRow: 1 + 2*idx, gridColumnStart: 1, gridColumnEnd: 5}} />
          ) : null}
          <div className="TreeView-appish-node-child-name TreeView-common-padding" style={{gridRow: 2*idx+2, gridColumn: 1}}>{name}</div>
          <div className="TreeView-appish-node-child-cxn" style={{gridRow: 1 + 2*idx + 1, gridColumn: 2}}><div className="TreeView-appish-node-child-cxn-inner" /></div>
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

const UserFunctionDefinitionView: React.FC<{node: UserFunctionDefinitionNode}> = ({ node }) => {
  const {classes: selectionClasses, handlers: selectionHandlers} = useSelectable(node);

  const parameters = node.children[0].children;
  const expressions = node.children[1].children;

  return (
    <div className={selectionClasses.concat(['TreeView-udf-node']).join(' ')} {...selectionHandlers} style={{backgroundColor: NORMAL_BOX_COLOR}}>
      <div className="TreeView-name-bar TreeView-common-padding">ƒ</div>
      <div className="TreeView-udf-node-main-container TreeView-common-padding">
        <div className="TreeView-udf-node-expressions">{expressions.map(child => (
          <NodeView key={child.id} node={child} />
        ))}</div>
        <div className="TreeView-udf-node-parameters">{parameters.map(child => (
          <NodeView key={child.id} node={child} />
        ))}</div>
      </div>
    </div>
  );
}

export const NodeView: React.FC<{node: Node}> = ({ node }) => {
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
    name: null,
    child: <NodeView node={child} />
  }));

  switch (node.type) {
    case 'UndefinedLiteral':
      return <SimpleNodeView node={node} contents={<span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>} boxColor={'red'} />

    case 'NumberLiteral':
      return <SimpleNodeView node={node} contents={node.value.toString()} boxColor="#cce8cc" />

    case 'ArrayLiteral':
      return <AppishNodeView node={node} mainText="[ ]" boxColor={NORMAL_BOX_COLOR} streamChildren={makeAnonChildrenViews()} functionChildren={[]} />

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
        const childView = {
          key: param.name,
          name: param.name.startsWith('_') ? null : param.name,
          child: <NodeView node={node.children[idx]} />
        };
        if (param.type === 'stream') {
          streamChildrenViews.push(childView);
        } else {
          functionChildrenViews.push(childView);
        }
      });

      return <AppishNodeView node={node} mainText={<strong>{displayedName}</strong>} boxColor={NORMAL_BOX_COLOR} streamChildren={streamChildrenViews} functionChildren={functionChildrenViews} />
    }

    case 'StreamReference': {
      const targetExpressionNode = ctxData.streamIdToNode.get(node.targetStreamId);
      if (!targetExpressionNode) {
        throw new Error();
      }
      const displayedName = isNamedNode(targetExpressionNode) ? targetExpressionNode.name : ('<stream ' + node.targetStreamId + '>');
      return <SimpleNodeView node={node} contents={displayedName} boxColor={STREAM_NAMEISH_BOX_COLOR} />
    }

    case 'StreamIndirection':
      return <AppishNodeView node={node} mainText={<em>{node.name}</em>} boxColor={STREAM_NAMEISH_BOX_COLOR} streamChildren={makeAnonChildrenViews()} functionChildren={[]} />

    case 'StreamParameter':
      return <SimpleNodeView node={node} contents={node.name} boxColor={'transparent'} />

    case 'UserFunctionDefinition':
      return <UserFunctionDefinitionView node={node} />

    default:
      throw new Error();
  }
}
