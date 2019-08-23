import React from 'react';
import './Simple.css';

function addSelection(selected, cns = '') {
  return selected ? (cns + ' SimpleTheme-selected') : cns;
}

export default {
  Program: ({ expressions }) => (
    <div className="SimpleTheme-program">{expressions}</div>
  ),

  Application: ({ functionName, streamArgs, functionArgs }) => (
    <div>
      <div><span className="SimpleTheme-application-function-name">{functionName}</span></div>
      <div className="SimpleTheme-application-arguments">
        {streamArgs.map(({key, name, expression}) => (
          <div className="SimpleTheme-application-argument" key={key}>{name ? <span className="SimpleTheme-application-argument-name">{name}:</span> : null}<span className="SimpleTheme-application-argument-expression">{expression}</span></div>
        ))}
        {functionArgs.map(({key, name, functionExpression}) => (
          <div className="SimpleTheme-application-argument" key={key}>{functionExpression}</div>
        ))}
      </div>
    </div>
  ),

  UserFunction: ({ parameterNames, expressions, selected }) => (
    <div className={addSelection(selected, 'SimpleTheme-user-function')}>
      <div>F {parameterNames.join(', ')}</div>
      <div className="SimpleTheme-user-function-expressions">{expressions}</div>
    </div>
  ),

  DefinitionExpression: ({ expression }) => (
    <div className="SimpleTheme-definition-expression">{expression}</div>
  ),

  Expression: ({ identifier, selected, inside }) => (
    <div className={addSelection(selected, 'SimpleTheme-expression')}>
      <div className="SimpleTheme-expression-main">{inside}</div>
      {identifier ? <div className="SimpleTheme-expression-identifier">{identifier}</div> : null}
    </div>
  ),

  Identifier: ({ selected, inside }) => (
    <div className={addSelection(selected, 'SimpleTheme-identifier')}>{inside}</div>
  ),

  StreamReference: ({ name }) => (
    <div><span className="SimpleTheme-stream-reference">{name}</span></div>
  ),

  UndefinedExpression: () => (
    <div className="SimpleTheme-undefined-expression">&nbsp;</div>
  ),

  ArrayLiteral: ({ keyedItems }) => (
    <div>
      <div>[</div>
      <div className="SimpleTheme-array-items">
        {keyedItems.map(([key, item]) => (
          <div className="SimpleTheme-array-item" key={key}>{item}</div>
        ))}
      </div>
      <div>]</div>
    </div>
  ),
}
