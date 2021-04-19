import React, { useRef, useCallback, useState } from 'react';
import { StoragePanel } from './StoragePanel';
import { Node, FunctionDefinitionNode } from '../compiler/Tree';
import CodeView from '../codeview/CodeView';
import { ProgramInfo, initialState, reducer as editorReducer } from './EditorReducer';
import './Editor.css';

function useEffectfulReducer<S, A>(reducer: (s: S, a: A) => S, initialArg: S): [S, (action: A) => void] {
  // The state is stored in useState, in order to trigger re-renders.
  // But the "authoritative" copy is stored with useRef, so that we don't
  // have any issues with see old versions from useState.
  const authoritativeState = useRef(initialArg);
  const [copiedState, setCopiedState] = useState(initialArg);

  // The dispatch method we return is memoized so that it's always the same function.
  const memoizedDispatch = useCallback((action) => {
    const newState = reducer(authoritativeState.current, action);
    authoritativeState.current = newState;
    setCopiedState(newState);
  }, [reducer]);

  return [copiedState, memoizedDispatch];
}

const Editor: React.FC = () => {
  // NOTE: We don't use useReducer here because it expects the reducer function
  // to be pure, and ours is not. So we have to do a workaround.
  const [state, dispatch] = useEffectfulReducer(editorReducer, initialState);

  const handleChangeProgramName = (newName: string) => {
    dispatch({type: 'SET_PROGRAM_NAME', newName});
  };

  const handleLoadProgram = (info: ProgramInfo, mainDef: FunctionDefinitionNode) => {
    dispatch({type: 'LOAD_PROGRAM', newProgram: {info: info, mainDef}});
  };

  const handleUpdateRoot = (newRoot: Node) => {
    dispatch({type: 'UPDATE_TREE', newNode: newRoot});
  };

  return (
    <div className="Editor">
      <div className="Editor-storage-panel-container Editor-panel">
        <StoragePanel programInfo={state.programInfo} mainDefinition={state.dispMainDef} onChangeName={handleChangeProgramName} onLoadProgram={handleLoadProgram} />
      </div>
      <CodeView root={state.dispMainDef} autoFocus={true} onUpdateRoot={handleUpdateRoot} />
    </div>
  );
}
export default Editor;
