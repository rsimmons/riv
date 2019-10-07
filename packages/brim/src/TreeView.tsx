import React, { createContext, useContext, useState } from 'react';
import { Node, StreamCreationNode, FunctionDefinitionNode, isNamedNode } from './Tree';
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

interface AppishNodeProps {
  mainText: React.ReactNode;
  boxColor: string;
  selected: boolean;
  childCxns?: boolean;
  onSelect: () => void;
  children?: ReadonlyArray<{
    key: string | number | undefined,
    name: string | null,
    child: React.ReactNode}
  >;
}

const AppishNode: React.FC<AppishNodeProps> = ({mainText, boxColor, selected, childCxns = true, onSelect, children = []}) => {
  const boxClasses: Array<string> = [];
  const [hovered, setHovered] = useState(false);

  const handleClick = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (onSelect && ((e.target as Element).tagName !== 'INPUT')) {
      e.stopPropagation();
      onSelect();
    }
  };

  const handleMouseOver = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    setHovered(true);
    e.stopPropagation();
  };

  const handleMouseOut = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    setHovered(false);
  };

  if (selected) {
    boxClasses.push('TreeView-selected');
  }
  if (hovered) {
    boxClasses.push('TreeView-hovered');
  }

  // TODO: handle clipboard-top, clipboard-rest?

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
        <div className={boxClasses.join(' ')} style={{gridRowStart: 1, gridRowEnd: rows+1, gridColumnStart: 1, gridColumnEnd: 3}} onClick={handleClick} onMouseOver={handleMouseOver} onMouseOut={handleMouseOut} />
      </div>
    );
  } else {
    return (
      <div className="TreeView-appish-node">
        <div className={boxClasses.concat(['TreeView-appish-node-padding']).join(' ')} style={{backgroundColor: boxColor}} onClick={handleClick} onMouseOver={handleMouseOver} onMouseOut={handleMouseOut}>
          {mainText}
        </div>
      </div>
    );
  }
};

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

  const handleSelect = () => {
    ctxData.onSelectNode(node);
  };

  const commonProps = {
    selected,
    onSelect: handleSelect,
  };

  const normalBoxColor = '#d8d8d8';
  const streamNameishColor = '#ccd9e8';

  const makeAnonChildrenViews = () => children.map((child, idx) => ({
    key: idx,
    name: null,
    child: <NodeView node={child} />
  }));

  switch (node.type) {
    case 'UndefinedLiteral':
      return <AppishNode mainText={<span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>} boxColor={'red'} {...commonProps} />

    case 'NumberLiteral':
      return <AppishNode mainText={node.value.toString()} boxColor="#cce8cc" {...commonProps} />

    case 'ArrayLiteral':
      return <AppishNode mainText="[ ]" boxColor={normalBoxColor} children={makeAnonChildrenViews()} {...commonProps} />

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

      return <AppishNode mainText={<strong>{displayedName}</strong>} boxColor={normalBoxColor} children={childrenViews} {...commonProps} />
    }

    case 'StreamReference': {
      const targetExpressionNode = ctxData.streamIdToNode.get(node.targetStreamId);
      if (!targetExpressionNode) {
        throw new Error();
      }
      const displayedName = isNamedNode(targetExpressionNode) ? targetExpressionNode.name : ('<stream ' + node.targetStreamId + '>');
      return <AppishNode mainText={displayedName} boxColor={streamNameishColor} {...commonProps} />
    }

    case 'StreamIndirection':
      return <AppishNode mainText={<em>{node.name}</em>} boxColor={streamNameishColor} children={makeAnonChildrenViews()} {...commonProps} />

    case 'StreamParameter':
      return <AppishNode mainText={<em>{node.name}</em>} boxColor={streamNameishColor} {...commonProps} />

    case 'UserFunctionDefinition':
      return <AppishNode mainText="ƒ" boxColor="#d3c9d8" childCxns={false} children={makeAnonChildrenViews()} {...commonProps} />

    case 'UserFunctionDefinitionParameters':
      return <AppishNode mainText={'\u2009'} boxColor="#efd5db" children={makeAnonChildrenViews()} {...commonProps} />

    case 'UserFunctionDefinitionExpressions':
      return <AppishNode mainText={'\u2009'} boxColor="#f1e0cc" children={makeAnonChildrenViews()} {...commonProps} />

    default:
      throw new Error();
  }
}
