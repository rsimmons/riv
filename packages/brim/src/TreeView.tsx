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

interface StyleOptions {
  backgroundColor: string;
}

interface GeneralNodeProps {
  mainText: React.ReactNode;
  styleOptions: StyleOptions;
  selected: boolean;
  childCxns: boolean;
  onSelect: () => void;
  children: ReadonlyArray<{
    key: string | number | undefined,
    name: string | null,
    child: React.ReactNode}
  >;
}

const GeneralNode: React.FC<GeneralNodeProps> = ({mainText, styleOptions, selected, childCxns, onSelect, children = []}) => {
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
      <div className="TreeView-general-node TreeView-general-node-with-children">
        <div style={{gridRowStart: 1, gridRowEnd: rows+1, gridColumnStart: 1, gridColumnEnd: 3, backgroundColor: styleOptions.backgroundColor }} />
        <div className="TreeView-general-node-main-text TreeView-general-node-padding TreeView-general-node-no-pointer" style={{gridRowStart: 1, gridRowEnd: rows+1, gridColumn: 1}}>{mainText}</div>
        <>{children.map(({key, name, child}, idx) => (
          <React.Fragment key={key}>
            {(idx > 0) ? (
              <div className="TreeView-general-node-spacer-row" style={{gridRow: 2*idx, gridColumnStart: 1, gridColumnEnd: 5}} />
            ) : null}
            <div className={name ? "TreeView-general-node-child-name TreeView-general-node-padding TreeView-general-node-no-pointer" : ''} style={{gridRow: 2*idx+1, gridColumn: 2}}>{name}</div>
            <div className={childCxns ? 'TreeView-general-node-child-cxn' : ''} style={{gridRow: 2*idx+1, gridColumn: 3}}><div className="TreeView-general-node-child-cxn-inner" /></div>
            <div className="TreeView-general-node-child-subtree" style={{gridRow: 2*idx+1, gridColumn: 4}}>{child}</div>
          </React.Fragment>
        ))}
        </>
        <div className={boxClasses.join(' ')} style={{gridRowStart: 1, gridRowEnd: rows+1, gridColumnStart: 1, gridColumnEnd: 3}} onClick={handleClick} onMouseOver={handleMouseOver} onMouseOut={handleMouseOut} />
      </div>
    );
  } else {
    return (
      <div className="TreeView-general-node">
        <div className={boxClasses.concat(['TreeView-general-node-padding']).join(' ')} style={{backgroundColor: styleOptions.backgroundColor}} onClick={handleClick} onMouseOver={handleMouseOver} onMouseOut={handleMouseOut}>
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

  const mainText: React.ReactNode | null = (() => {
    switch (node.type) {
      case 'UndefinedLiteral':
        return <span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>

      case 'UserFunctionDefinition':
        return 'ƒ';

      case 'UserFunctionDefinitionParameters':
      case 'UserFunctionDefinitionExpressions':
        return null;

      case 'StreamIndirection':
      case 'StreamParameter':
        return <em>{node.name}</em>;

      case 'NumberLiteral':
        return node.value.toString();

      case 'StreamReference': {
        const targetExpressionNode = ctxData.streamIdToNode.get(node.targetStreamId);
        if (!targetExpressionNode) {
          throw new Error();
        }
        return isNamedNode(targetExpressionNode) ? targetExpressionNode.name : '<stream ' + node.targetStreamId + '>';
      }

      case 'Application': {
        const functionNode = ctxData.functionIdToNode.get(node.functionId);
        if (!functionNode) {
          throw new Error();
        }
        return <strong>{functionNode.name ? functionNode.name : '<function ' + node.functionId + '>'}</strong>
      }

      default:
        throw new Error();
    }
  })();

  const children: ReadonlyArray<Node> = node.children;
  const childrenProp = (() => {
    switch (node.type) {
      case 'Application': {
        const functionNode = ctxData.functionIdToNode.get(node.functionId);
        if (!functionNode) {
          throw new Error();
        }
        if (functionNode.signature.parameters.length !== node.children.length) {
          throw new Error('params and args length mismatch');
        }
        return functionNode.signature.parameters.map((param, idx) => ({
          key: param.name,
          name: param.name.startsWith('_') ? null : param.name,
          child: <NodeView node={node.children[idx]} />
        }));
      }

      default:
        return children.map((child, idx) => ({
          key: idx,
          name: null,
          child: <NodeView node={child} />
        }));
    }
  })();

  const backgroundColor = (() => {
    switch (node.type) {
      case 'UndefinedLiteral':
        return 'red';

      case 'UserFunctionDefinition':
        return '#d3c9d8';

      case 'UserFunctionDefinitionParameters':
        return '#efd5db';

      case 'UserFunctionDefinitionExpressions':
          return '#f1e0cc';

      case 'NumberLiteral':
        return '#cce8cc';

      case 'StreamReference':
      case 'StreamIndirection':
      case 'StreamParameter':
        return '#ccd9e8';

      default:
        return '#d8d8d8';
    }
  })();

  const styleOptions = {
    backgroundColor,
  };

  const handleSelect = () => {
    ctxData.onSelectNode(node);
  };

  const selected = (ctxData.selectedNode === node);

  if (selected && ctxData.mainState.editingSelected) {
    return <ExpressionChooser mainState={ctxData.mainState} dispatch={ctxData.dispatch} />
  } else {
    return <GeneralNode mainText={mainText} selected={selected} childCxns={node.type !== 'UserFunctionDefinition'} onSelect={handleSelect} styleOptions={styleOptions} children={childrenProp} />
  }
}
