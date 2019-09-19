import React, { useState, useEffect, useRef, useCallback } from 'react';
import genuid from './uid';
import './StoragePanel.css';

export default function StoragePanel({ currentProgram, onChangeName, onLoadProgram }) {
  const ls = window.localStorage;
  const KEY_PREFIX = 'rivprog:';

  const [selectedProgramId, setSelectedProgramId] = useState();
  const [savedPrograms, setSavedPrograms] = useState([]);

  const refreshSavedPrograms = useCallback((setProgramId) => {
    let newProgramId = setProgramId === undefined ? selectedProgramId : setProgramId;

    const sp = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k.startsWith(KEY_PREFIX)) {
        const obj = JSON.parse(ls.getItem(k));
        sp.push(obj);
      }
    }
    setSavedPrograms(sp);

    const savedProgramIds = sp.map(prog => prog.programId);
    if (!savedProgramIds.includes(newProgramId)) {
      newProgramId = undefined;
    }

    setSelectedProgramId(newProgramId);
  }, [selectedProgramId, ls]);

  useEffect(() => {
    refreshSavedPrograms();
  }, [refreshSavedPrograms]);

  const handleChangeName = (e) => {
    if (onChangeName) {
      onChangeName(e.target.value);
    }
  };

  const handleSave = () => {
    const k = KEY_PREFIX + currentProgram.programId;
    const json = JSON.stringify(currentProgram);
    ls.setItem(k, json);
    refreshSavedPrograms(currentProgram.programId);
  };

  const handleClone = () => {
    onLoadProgram({
      ...currentProgram,
      id: genuid(),
    });
  };

  const selectRef = useRef();
  const handleSetProgramId = (e) => {
    setSelectedProgramId(e.target.value);
  };

  const handleLoad = () => {
    if (selectRef.current && selectRef.current.value) {
      const k = KEY_PREFIX + selectRef.current.value;
      const obj = JSON.parse(ls.getItem(k));
      onLoadProgram(obj);
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
        <label>UID: <span>{currentProgram.programId}</span></label>{' '}
        <label>Name: <input value={currentProgram.name} onChange={handleChangeName} /></label>{' '}
        <button onClick={handleSave}>Save</button>{' '}
        <button onClick={handleClone}>Clone</button>{' '}
        <button disabled>Import</button>{' '}
        <button disabled>Export</button>{' '}
      </div>
      <div>
        <span>Saved Programs:</span>{' '}
        <select ref={selectRef} value={selectedProgramId} onChange={handleSetProgramId}>{savedPrograms.map((prog) => (
          <option key={prog.programId} value={prog.programId}>{prog.name} &lt;{prog.programId}&gt;</option>
        ))}
        </select>{' '}
        <button onClick={handleLoad} disabled={savedPrograms.length === 0}>Load</button>{' '}
        <button onClick={handleDelete} disabled={savedPrograms.length === 0}>Delete</button>{' '}
      </div>
    </div>
  )
}
