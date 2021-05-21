import React, { useRef, useCallback, useState, FormEventHandler } from 'react';
import { Node } from '../compiler/Tree';
import CodeView from '../codeview/CodeView';
import Logo from './Logo';
import { initialState, reducer as editorReducer } from './EditorReducer';
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

type SelectOptions = ReadonlyArray<[string, string]>;
const Selector: React.FC<{options: SelectOptions, initVal: string, onSelect: (val: string) => void}> = ({options, initVal, onSelect}) => {
  const [val, setVal] = useState<string>(initVal);

  const handleInput: FormEventHandler<HTMLSelectElement> = (e) => {
    const v = e.currentTarget.value;
    setVal(v);
    onSelect(v);
  };

  return (
    <select value={val} onInput={handleInput}>
      {options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select>
  );
}

const FORMATS: SelectOptions = [
  ['new', 'C-ish'],
  ['old', 'Bubbles'],
];
const THEMES: SelectOptions = [
  ['dark', 'Dark'],
  ['light', 'Light'],
];

const Editor: React.FC = () => {
  // NOTE: We don't use useReducer here because it expects the reducer function
  // to be pure, and ours is not. So we have to do a workaround.
  const [state, dispatch] = useEffectfulReducer(editorReducer, initialState);

  /*
  const handleChangeProgramName = (newName: string) => {
    dispatch({type: 'SET_PROGRAM_NAME', newName});
  };

  const handleLoadProgram = (info: ProgramInfo, mainDef: FunctionDefinitionNode) => {
    dispatch({type: 'LOAD_PROGRAM', newProgram: {info: info, mainDef}});
  };
  */

  const handleUpdateRoot = (newRoot: Node) => {
    dispatch({type: 'UPDATE_TREE', newNode: newRoot});
  };

  const [format, setFormat] = useState(FORMATS[0][0]);
  const [theme, setTheme] = useState(THEMES[0][0]);

  const [wrapWidth, setWrapWidth] = useState(60);
  const handleWrapWidthInput: React.FormEventHandler<HTMLInputElement> = (e) => {
    setWrapWidth(+e.currentTarget.value);
  };

  return (
    <div className={'Editor theme-' + theme}>
      {/* <div className="Editor-storage-panel-container Editor-panel">
        <StoragePanel programInfo={state.programInfo} mainDefinition={state.dispMainDef} onChangeName={handleChangeProgramName} onLoadProgram={handleLoadProgram} />
      </div> */}
      <div className="Editor-header">
        <div className="Editor-logo"><Logo /></div>
        <div className="Editor-header-spacer" />
        <div className="Editor-header-controls">
          <label className="Editor-control-select">Theme<Selector options={THEMES} initVal={theme} onSelect={v => setTheme(v)} /></label>
          <label className="Editor-control-select">Format<Selector options={FORMATS} initVal={format} onSelect={v => setFormat(v)} /></label>
          <label className="Editor-control-range">Wrap<input type="range" min="10" max="100" value={wrapWidth} style={{'width': '6em'}} onInput={handleWrapWidthInput} /></label>
        </div>
      </div>
      <div className="Editor-codeview"><div className="Editor-codeview-inner">
        <CodeView root={state.dispMainDef} format={format} theme={theme} wrapWidth={wrapWidth} autoFocus={true} onUpdateRoot={handleUpdateRoot} />
      </div></div>
    </div>
  );
}
export default Editor;
