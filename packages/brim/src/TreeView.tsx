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

interface AppishNodeProps {
  node: Node | null;
  mainText: React.ReactNode;
  boxColor: string;
  children?: ReadonlyArray<{
    key: string | number | undefined,
    name: string | null,
    child: React.ReactNode}
  >;
}

const SimpleNodeView: React.FC<{node: Node, contents: React.ReactNode, boxColor: string}> = ({node, contents, boxColor}) => {
  const {classes: selectionClasses, handlers: selectionHandlers} = useSelectable(node);

  return (
    <div className={selectionClasses.concat(['TreeView-simple-node', 'TreeView-common-padding']).join(' ')} {...selectionHandlers} style={{background: boxColor}}>{contents}</div>
  );
};

const AppishNodeView: React.FC<AppishNodeProps> = ({node, mainText, boxColor, children = []}) => {
  const {classes: selectionClasses, handlers: selectionHandlers} = useSelectable(node);

  const rows = 2*children.length;
  return (
    <div className="TreeView-appish-node">
      <div style={{gridRowStart: 1, gridRowEnd: rows+1, gridColumnStart: 1, gridColumnEnd: 2, background: boxColor }} />
      <div className="TreeView-name-bar-color TreeView-common-padding TreeView-appish-node-no-pointer" style={{gridRow: 1, gridColumn: 1}}>{mainText}</div>
      <>{children.map(({key, name, child}, idx) => (
        <React.Fragment key={key}>
          {(idx > 0) ? (
            <div className="TreeView-appish-node-spacer-row" style={{gridRow: 2*idx+1, gridColumnStart: 1, gridColumnEnd: 5}} />
          ) : null}
          <div className={name ? "TreeView-appish-node-child-name TreeView-common-padding TreeView-appish-node-no-pointer" : ''} style={{gridRow: 2*idx+2, gridColumn: 1}}>{name}</div>
          <div className="TreeView-appish-node-child-cxn" style={{gridRow: 2*idx+2, gridColumn: 2}}><div className="TreeView-appish-node-child-cxn-inner" /></div>
          <div className="TreeView-appish-node-child-subtree" style={{gridRow: 2*idx+2, gridColumn: 3}}>{child}</div>
        </React.Fragment>
      ))}
      </>
      <div className={selectionClasses.join(' ')} style={{gridRowStart: 1, gridRowEnd: rows+1, gridColumnStart: 1, gridColumnEnd: 2}} {...selectionHandlers} />
    </div>
  );
};

const UserFunctionDefinitionView: React.FC<{node: UserFunctionDefinitionNode}> = ({ node }) => {
  const {classes: selectionClasses, handlers: selectionHandlers} = useSelectable(node);

  const parameters = node.children[0].children;
  const expressions = node.children[1].children;

  return (
    <div className={selectionClasses.concat(['TreeView-udf-node']).join(' ')} {...selectionHandlers} style={{backgroundColor: NORMAL_BOX_COLOR}}>
      <div className="TreeView-name-bar-color TreeView-common-padding">ƒ</div>
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
      return <AppishNodeView node={node} mainText="[ ]" boxColor={NORMAL_BOX_COLOR} children={makeAnonChildrenViews()} />

    case 'Application': {
      const functionNode = ctxData.functionIdToNode.get(node.functionId);
      if (!functionNode) {
        throw new Error();
      }
      const displayedName = functionNode.name ? functionNode.name : ('<function ' + node.functionId + '>');

      if (functionNode.signature.parameters.length !== node.children.length) {
        throw new Error('params and args length mismatch');
      }
      const childrenViews = functionNode.signature.parameters.map((param, idx) => ({
        key: param.name,
        name: param.name.startsWith('_') ? null : param.name,
        child: <NodeView node={node.children[idx]} />
      }));

      return <AppishNodeView node={node} mainText={<strong>{displayedName}</strong>} boxColor={NORMAL_BOX_COLOR} children={childrenViews} />
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
      return <AppishNodeView node={node} mainText={<em>{node.name}</em>} boxColor={STREAM_NAMEISH_BOX_COLOR} children={makeAnonChildrenViews()} />

    case 'StreamParameter':
      return <SimpleNodeView node={node} contents={node.name} boxColor={'transparent'} />

    case 'UserFunctionDefinition':
      return <UserFunctionDefinitionView node={node} />

    default:
      throw new Error();
  }
}
