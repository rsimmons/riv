import React, { useState, useEffect, useRef, useCallback } from 'react';
import genuid from '../util/uid';
import { ProgramInfo } from './EditorReducer';
import { FunctionDefinitionNode } from '../compiler/Tree';
import './StoragePanel.css';

interface Program {
  info: ProgramInfo;
  mainDefinition: FunctionDefinitionNode;
}

export const StoragePanel: React.FC<{programInfo: ProgramInfo, mainDefinition: FunctionDefinitionNode, onChangeName: (name: string) => void, onLoadProgram: (info: ProgramInfo, mainDefinition: FunctionDefinitionNode) => void}> = ({ programInfo, mainDefinition, onChangeName, onLoadProgram }) => {
  const ls = window.localStorage;
  const KEY_PREFIX = 'rivprog:';

  const [selectedProgramId, setSelectedProgramId] = useState<string | undefined>();
  const [savedPrograms, setSavedPrograms] = useState<ReadonlyArray<Program>>([]);

  const refreshSavedPrograms = useCallback((setProgramId: string | undefined = undefined) => {
    let newProgramId = setProgramId === undefined ? selectedProgramId : setProgramId;

    const sp: Array<Program> = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k === null) {
        throw new Error();
      }
      if (k.startsWith(KEY_PREFIX)) {
        const json = ls.getItem(k);
        if (json === null) {
          throw new Error();
        }
        const obj = JSON.parse(json);
        sp.push(obj);
      }
    }
    setSavedPrograms(sp);

    const savedProgramIds = sp.map(prog => prog.info.id);
    if ((newProgramId === undefined) || !savedProgramIds.includes(newProgramId)) {
      newProgramId = undefined;
    }

    setSelectedProgramId(newProgramId);
  }, [selectedProgramId, ls]);

  useEffect(() => {
    refreshSavedPrograms();
  }, [refreshSavedPrograms]);

  const handleChangeName = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onChangeName) {
      onChangeName(e.target.value);
    }
  };

  const handleSave = () => {
    const k = KEY_PREFIX + programInfo.id;
    const prog = {
      info: programInfo,
      mainDefinition,
    };
    const json = JSON.stringify(prog);
    ls.setItem(k, json);
    refreshSavedPrograms(prog.info.id);
  };

  const handleClone = () => {
    onLoadProgram({...programInfo, id: genuid()}, mainDefinition);
  };

  const selectRef = useRef<HTMLSelectElement>(null);
  const handleSetProgramId = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedProgramId(e.target.value);
  };

  const handleLoad = () => {
    if (selectRef.current && selectRef.current.value) {
      const progId = selectRef.current.value;
      const hits = savedPrograms.filter(prog => prog.info.id === progId);
      if (hits.length !== 1) {
        throw new Error();
      }
      onLoadProgram(hits[0].info, hits[0].mainDefinition);
    }
  };

  const handleDelete = () => {
    if (selectRef.current && selectRef.current.value) {
      const k = KEY_PREFIX + selectRef.current.value;
      ls.removeItem(k);
      refreshSavedPrograms();
    }
  };

  return (
    <div className="StoragePanel">
      <h2>Storage</h2>
      <div>
        <span>Current Program:</span>{' '}
        <label>UID: <span>{programInfo.id}</span></label>{' '}
        <label>Name: <input value={programInfo.name} onChange={handleChangeName} /></label>{' '}
        <button onClick={handleSave}>Save</button>{' '}
        <button onClick={handleClone}>Clone</button>{' '}
        <button disabled>Import</button>{' '}
        <button disabled>Export</button>{' '}
      </div>
      <div>
        <span>Saved Programs:</span>{' '}
        <select ref={selectRef} value={selectedProgramId} onChange={handleSetProgramId}>{savedPrograms.map((prog) => (
          <option key={prog.info.id} value={prog.info.id}>{prog.info.name} &lt;{prog.info.id}&gt;</option>
        ))}
        </select>{' '}
        <button onClick={handleLoad} disabled={savedPrograms.length === 0}>Load</button>{' '}
        <button onClick={handleDelete} disabled={savedPrograms.length === 0}>Delete</button>{' '}
      </div>
    </div>
  )
}
