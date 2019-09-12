import React, { useState } from 'react';
import './Simple.css';

function Selectable({ marks, onSelect, onEdit, children, extraClassName }) {
  const [hovered, setHovered] = useState(false);

  let className = extraClassName || '';
  className += ' SimpleTheme-selectable';
  if (marks.includes('selected')) {
    className += ' SimpleTheme-selected';
  } else if (hovered) {
    className += ' SimpleTheme-hovered';
  } else if (marks.includes('clipboard-top')) {
    className += ' SimpleTheme-clipboard-top';
  } else if (marks.includes('clipboard-rest')) {
    className += ' SimpleTheme-clipboard-rest';
  }

  const handleClick = (e) => {
    if (onSelect && (e.target.tagName !== 'INPUT')) {
      e.stopPropagation();
      onSelect();
    }
  };

  const handleDoubleClick = (e) => {
    if (onEdit && (e.target.tagName !== 'INPUT')) {
      e.stopPropagation();
      onEdit();
    }
  };

  const handleMouseOver = (e) => {
    setHovered(true);
    e.stopPropagation();
  };

  const handleMouseOut = (e) => {
    setHovered(false);
  };

  return (
    <div className={className} onClick={handleClick} onDoubleClick={handleDoubleClick} onMouseOver={handleMouseOver} onMouseOut={handleMouseOut}>
      {children}
    </div>
  );
}

export const generateTheme = ({ expressionGrouping, applicationArguments }) => ({
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

  UserFunction: ({ parameterNames, expressions, marks, onSelect }) => (
    <Selectable marks={marks} onSelect={onSelect} extraClassName={'SimpleTheme-user-function'}>
      <div>ƒ {parameterNames.join(', ')}</div>
      <div className="SimpleTheme-user-function-expressions">{expressions}</div>
    </Selectable>
  ),

  DefinitionExpression: ({ expression }) => (
    <div className="SimpleTheme-definition-expression">{expression}</div>
  ),

  Expression: ({ identifier, marks, onSelect, onEdit, inside }) => {
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
      <Selectable marks={marks} onSelect={onSelect} onEdit={onEdit} extraClassName={exprClass}>
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
      </Selectable>
    );
  },

  Identifier: ({ marks, onSelect, inside }) => (
    <Selectable marks={marks} onSelect={onSelect} extraClassName={'SimpleTheme-identifier'}>{inside}</Selectable>
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
