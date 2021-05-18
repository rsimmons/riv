import React, { useRef, useCallback, useState, FormEventHandler } from 'react';
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

const Selector: React.FC<{options: ReadonlyArray<string>, initVal: string, onSelect: (val: string) => void}> = ({options, initVal, onSelect}) => {
  const [val, setVal] = useState<string>(initVal);

  const handleInput: FormEventHandler<HTMLSelectElement> = (e) => {
    const v = e.currentTarget.value;
    setVal(v);
    onSelect(v);
  };

  return (
    <select value={val} onInput={handleInput}>
      {options.map(opt => <option key={opt}>{opt}</option>)}
    </select>
  );
}

const LAYOUTS = ['old', 'new'];
const PALETTES = ['light', 'dark'];

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

  const [layout, setLayout] = useState(LAYOUTS[0]);
  const [palette, setPalette] = useState(PALETTES[0]);

  const [wrapWidth, setWrapWidth] = useState(60);
  const handleWrapWidthInput: React.FormEventHandler<HTMLInputElement> = (e) => {
    setWrapWidth(+e.currentTarget.value);
  };

  return (
    <div className="Editor">
      <div className="Editor-storage-panel-container Editor-panel">
        <StoragePanel programInfo={state.programInfo} mainDefinition={state.dispMainDef} onChangeName={handleChangeProgramName} onLoadProgram={handleLoadProgram} />
      </div>
      <div style={{display: 'flex', marginBottom: '1em'}}>
        <Selector options={LAYOUTS} initVal={layout} onSelect={v => setLayout(v)} />
        <Selector options={PALETTES} initVal={palette} onSelect={v => setPalette(v)} />
        <input type="range" min="10" max="100" value={wrapWidth} style={{'width': '6em'}} onInput={handleWrapWidthInput} />
      </div>
      <CodeView root={state.dispMainDef} layout={layout} palette={palette} wrapWidth={wrapWidth} autoFocus={true} onUpdateRoot={handleUpdateRoot} />
    </div>
  );
}
export default Editor;
