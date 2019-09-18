import React, { useState } from 'react';
import { generateTheme } from './themes/Simple';
import './ThemePicker.css';

const INITIAL_OPTIONS = {
  expressionGrouping: 'background',
  applicationArguments: 'right',
};

export const INITIAL_THEME = generateTheme(INITIAL_OPTIONS);

function Select({ keyLabels, selectedKey, onChange }) {
  return (
    <select value={selectedKey} onChange={evt => { onChange(evt.target.value) }}>
      {keyLabels.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select>
  )
}

export function ThemePicker({ onChange }) {
  const [options, setOptions] = useState(INITIAL_OPTIONS);

  const update = (newOptions) => {
    setOptions(newOptions);
    onChange(generateTheme(newOptions));
  };

  return (
    <div className="ThemePicker">
      <h2>Display</h2>
      <div className="ThemePicker-option"><label>Expression Grouping: <Select keyLabels={[
        ['none', 'None'],
        ['line', 'Line'],
        ['bracket', 'Bracket'],
        ['background', 'Background'],
        ['shadow', 'Shadow'],
      ]} selectedKey={options.expressionGrouping} onChange={v => update({ ...options, expressionGrouping: v })} /></label></div>
      <div className="ThemePicker-option"><label>Application Arguments: <Select keyLabels={[
        ['below', 'Below'],
        ['right', 'Right'],
        ['right-centered', 'Right (centered)'],
      ]} selectedKey={options.applicationArguments} onChange={v => update({ ...options, applicationArguments: v })} /></label></div>
    </div>
  );
}

/*
<label>Theme:
            <select value={theme} onChange={evt => { setTheme(evt.target.value) }}>{THEMES.map(([name, ]) => <option key={name} value={name}>{name}</option>)}</select>
          </label>
*/
