import React from 'react';
import './Simple.css';

function addSelection(selected, cns = '') {
  return selected ? (cns + ' SimpleTheme-selected') : cns;
}

export const generateTheme = ({ expressionGrouping, applicationArguments }) => ({
  Program: ({ expressions }) => (
    <div className="SimpleTheme-program">{expressions}</div>
  ),

  Application: ({ functionName, streamArgs, functionArgs }) => {
    const appClass = ((applicationArguments === 'right') || (applicationArguments === 'right-centered')) ? 'SimpleTheme-application-flex' : '';
    const nameClass = 'SimpleTheme-application-function-name' + ((applicationArguments === 'right-centered') ? ' SimpleTheme-application-function-name-centered' : '');
    return (
      <div className={appClass}>
        <div className={nameClass}>{functionName}</div>
        <div className="SimpleTheme-application-arguments">
          {streamArgs.map(({key, name, expression}) => (
            <div className="SimpleTheme-application-argument" key={key}>{name ? <span className="SimpleTheme-application-argument-name">{name}:</span> : null}<span className="SimpleTheme-application-argument-expression">{expression}</span></div>
          ))}
          {functionArgs.map(({key, name, functionExpression}) => (
            <div className="SimpleTheme-application-argument" key={key}>{functionExpression}</div>
          ))}
        </div>
      </div>
    );
  },

  UserFunction: ({ parameterNames, expressions, selected }) => (
    <div className={addSelection(selected, 'SimpleTheme-user-function')}>
      <div>F {parameterNames.join(', ')}</div>
      <div className="SimpleTheme-user-function-expressions">{expressions}</div>
    </div>
  ),

  DefinitionExpression: ({ expression }) => (
    <div className="SimpleTheme-definition-expression">{expression}</div>
  ),

  Expression: ({ identifier, selected, inside }) => {
    let exprClass = 'SimpleTheme-expression';

    switch (expressionGrouping) {
      case 'background':
        exprClass += ' SimpleTheme-expression-background';
        break;

      case 'shadow':
        exprClass += ' SimpleTheme-expression-shadow';
        break;

      default:
        // ignore
        break;
    }

    return (
      <div className={addSelection(selected, exprClass)}>
        { (() => {
          switch (expressionGrouping) {
            case 'line':
              return (
                <div className="SimpleTheme-expression-line" />
              );

            case 'bracket':
              return (
                <div className="SimpleTheme-expression-bracket" />
              );

            default:
              return null;
          }
        })() }
        <div>
          {identifier ? <div className="SimpleTheme-expression-identifier">{identifier}</div> : null}
          <div className="SimpleTheme-expression-main">{inside}</div>
        </div>
      </div>
    );
  },

  Identifier: ({ selected, inside }) => (
    <span className={addSelection(selected, 'SimpleTheme-identifier')}>{inside}</span>
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
});
