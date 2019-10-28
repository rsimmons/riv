import React, { createContext, useContext, useState } from 'react';
import { Node, RivFunctionDefinitionNode } from './Tree';
import ExpressionChooser from './ExpressionChooser';
import { State } from './State';
import './TreeView.css';

const NORMAL_BOX_COLOR = '#d8d8d8';
const STREAM_REFERENCE_BOX_COLOR = '#ccd9e8';

export interface TreeViewContextData {
  selectedNode: Node,
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

const RivFunctionDefinitionView: React.FC<{node: RivFunctionDefinitionNode, inheritedName?: string}> = ({ node, inheritedName }) => {
  const {classes: selectionClasses, handlers: selectionHandlers} = useSelectable(node);

  const parameters = node.children[0].children;
  const expressions = node.children[1].children;

  return (
    <div className={selectionClasses.concat(['TreeView-udf-node']).join(' ')} {...selectionHandlers} style={{backgroundColor: NORMAL_BOX_COLOR}}>
      <div className="TreeView-name-bar TreeView-common-padding">{node.definition.desc || (inheritedName || 'ƒ')}</div>
      <div className="TreeView-udf-node-main-container TreeView-common-padding">
        <div className="TreeView-udf-node-expressions">{expressions.map(child => (
          <NodeView node={child} />
        ))}</div>
        <div className="TreeView-udf-node-parameters">{parameters.map(child => (
          <NodeView key={child.parameter.name} node={child} />
        ))}</div>
      </div>
    </div>
  );
}

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
    case 'SimpleStreamDefinition':
      switch (node.definition.type) {
        case 'und':
          return <SimpleNodeView node={node} contents={<span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>} boxColor={'red'} />

        case 'num':
          return <SimpleNodeView node={node} contents={node.definition.value.toString()} boxColor="#cce8cc" />

        case 'arr':
          return <AppishNodeView node={node} name="[ ]" boxColor={NORMAL_BOX_COLOR} streamChildren={makeAnonChildrenViews()} functionChildren={[]} />

        default:
          throw new Error();
      }

    case 'Application': {
      const displayedName = node.appliedFunctionDefinition.desc || ('<function ' + node.appliedFunctionDefinition.id + '>');

      if (node.appliedFunctionDefinition.signature.streamParameters.length !== node.children.length) {
        throw new Error('params and args length mismatch');
      }

      const streamChildrenViews: Array<ChildView> = node.appliedFunctionDefinition.signature.streamParameters.map((param, idx) => {
        const displayName = param.name.startsWith('_') ? undefined : param.name;
        return {
          key: param.name,
          name: displayName,
          child: <NodeView node={node.children[idx]} inheritedName={displayName} />
        };
      });

      const functionChildrenViews: Array<ChildView> = node.appliedFunctionDefinition.signature.functionParameters.map((param, idx) => {
        const displayName = param.name.startsWith('_') ? undefined : param.name;
        return {
          key: param.name,
          name: displayName,
          child: <NodeView node={node.children[idx]} inheritedName={displayName} />
        };
      });

      return <AppishNodeView node={node} name={displayedName} boxColor={NORMAL_BOX_COLOR} streamChildren={streamChildrenViews} functionChildren={functionChildrenViews} />
    }

    case 'StreamReference': {
      const displayedName = node.targetDefinition.desc || ('<stream ' + node.targetDefinition.id + '>');
      return <SimpleNodeView node={node} contents={displayedName} boxColor={STREAM_REFERENCE_BOX_COLOR} />
    }

    case 'StreamParameter':
      return <SimpleNodeView node={node} contents={node.parameter.name} boxColor={'transparent'} />

    case 'RivFunctionDefinition':
      return <RivFunctionDefinitionView node={node} inheritedName={inheritedName} />

    default:
      throw new Error();
  }
}
