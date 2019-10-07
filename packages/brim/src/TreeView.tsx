import React, { createContext, useContext, useState } from 'react';
import { Node, StreamCreationNode, FunctionDefinitionNode, isNamedNode, UserFunctionDefinitionNode } from './Tree';
import ExpressionChooser from './ExpressionChooser';
import './TreeView.css';
import { StreamID, FunctionID } from './Identifier';
import { State } from './State';

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
  selectableNode: Node | null;
  mainText: React.ReactNode;
  boxColor: string;
  childCxns?: boolean;
  children?: ReadonlyArray<{
    key: string | number | undefined,
    name: string | null,
    child: React.ReactNode}
  >;
}

const AppishNode: React.FC<AppishNodeProps> = ({selectableNode, mainText, boxColor, childCxns = true, children = []}) => {
  const {classes: selectionClasses, handlers: selectionHandlers} = useSelectable(selectableNode);

  if (children.length > 0) {
    const rows = 2*children.length - 1;
    return (
      <div className="TreeView-appish-node TreeView-appish-node-with-children">
        <div style={{gridRowStart: 1, gridRowEnd: rows+1, gridColumnStart: 1, gridColumnEnd: 3, backgroundColor: boxColor }} />
        <div className="TreeView-appish-node-main-text TreeView-appish-node-padding TreeView-appish-node-no-pointer" style={{gridRowStart: 1, gridRowEnd: rows+1, gridColumn: 1}}>{mainText}</div>
        <>{children.map(({key, name, child}, idx) => (
          <React.Fragment key={key}>
            {(idx > 0) ? (
              <div className="TreeView-appish-node-spacer-row" style={{gridRow: 2*idx, gridColumnStart: 1, gridColumnEnd: 5}} />
            ) : null}
            <div className={name ? "TreeView-appish-node-child-name TreeView-appish-node-padding TreeView-appish-node-no-pointer" : ''} style={{gridRow: 2*idx+1, gridColumn: 2}}>{name}</div>
            <div className={childCxns ? 'TreeView-appish-node-child-cxn' : ''} style={{gridRow: 2*idx+1, gridColumn: 3}}><div className="TreeView-appish-node-child-cxn-inner" /></div>
            <div className="TreeView-appish-node-child-subtree" style={{gridRow: 2*idx+1, gridColumn: 4}}>{child}</div>
          </React.Fragment>
        ))}
        </>
        <div className={selectionClasses.join(' ')} style={{gridRowStart: 1, gridRowEnd: rows+1, gridColumnStart: 1, gridColumnEnd: 3}} {...selectionHandlers} />
      </div>
    );
  } else {
    return (
      <div className="TreeView-appish-node">
        <div className={selectionClasses.concat(['TreeView-appish-node-padding']).join(' ')} style={{backgroundColor: boxColor}} {...selectionHandlers}>
          {mainText}
        </div>
      </div>
    );
  }
};

const UserFunctionDefinitionView: React.FC<{node: UserFunctionDefinitionNode}> = ({ node }) => {
  return (
    <div />
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

  const normalBoxColor = '#d8d8d8';
  const streamNameishColor = '#ccd9e8';

  const makeAnonChildrenViews = () => children.map((child, idx) => ({
    key: idx,
    name: null,
    child: <NodeView node={child} />
  }));

  switch (node.type) {
    case 'UndefinedLiteral':
      return <AppishNode selectableNode={node} mainText={<span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>} boxColor={'red'} />

    case 'NumberLiteral':
      return <AppishNode selectableNode={node} mainText={node.value.toString()} boxColor="#cce8cc" />

    case 'ArrayLiteral':
      return <AppishNode selectableNode={node} mainText="[ ]" boxColor={normalBoxColor} children={makeAnonChildrenViews()} />

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

      return <AppishNode selectableNode={node} mainText={<strong>{displayedName}</strong>} boxColor={normalBoxColor} children={childrenViews} />
    }

    case 'StreamReference': {
      const targetExpressionNode = ctxData.streamIdToNode.get(node.targetStreamId);
      if (!targetExpressionNode) {
        throw new Error();
      }
      const displayedName = isNamedNode(targetExpressionNode) ? targetExpressionNode.name : ('<stream ' + node.targetStreamId + '>');
      return <AppishNode selectableNode={node} mainText={displayedName} boxColor={streamNameishColor} />
    }

    case 'StreamIndirection':
      return <AppishNode selectableNode={node} mainText={<em>{node.name}</em>} boxColor={streamNameishColor} children={makeAnonChildrenViews()} />

    case 'StreamParameter':
      return <AppishNode selectableNode={node} mainText={<em>{node.name}</em>} boxColor={streamNameishColor} />

    case 'UserFunctionDefinition':
      return <AppishNode selectableNode={node} mainText="ƒ" boxColor="#d3c9d8" childCxns={false} children={makeAnonChildrenViews()} />

    case 'UserFunctionDefinitionParameters':
      return <AppishNode selectableNode={null} mainText={'\u2009'} boxColor="#efd5db" children={makeAnonChildrenViews()} />

    case 'UserFunctionDefinitionExpressions':
      return <AppishNode selectableNode={null} mainText={'\u2009'} boxColor="#f1e0cc" children={makeAnonChildrenViews()} />

    default:
      throw new Error();
  }
}
