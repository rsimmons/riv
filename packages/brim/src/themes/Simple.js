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

export const generateTheme = ({ expressionGrouping, applicationArguments }) => {
  const GeneralNode = ({mainText, children = [], boxClasses = []}) => {
    if (children.length > 0) {
      const rows = children.length;
      return (
        <div className="SimpleTheme-general-node SimpleTheme-general-node-with-children">
          <div className={boxClasses.concat(['SimpleTheme-general-node-left', 'SimpleTheme-general-node-padding']).join(' ')} style={{gridRowStart: 1, gridRowEnd: rows+1}}>{mainText}</div>
          <>{children.map(({key, name, child}, idx) => (
            <React.Fragment key={key}>
              <div className={name ? boxClasses.concat(['SimpleTheme-general-node-child-name', 'SimpleTheme-general-node-padding']).join(' ') : ''} style={{gridRow: idx+1, gridColumn: 2}}>{name}</div>
              <div className="SimpleTheme-general-node-child-cxn" style={{gridRow: idx+1, gridColumn: 3}}><div className="SimpleTheme-general-node-child-cxn-inner" /></div>
              <div className="SimpleTheme-general-node-child-subtree" style={{gridRow: idx+1, gridColumn: 4}}>{child}</div>
            </React.Fragment>
          ))}
          </>
        </div>
      );
    } else {
      return (
        <div className="SimpleTheme-general-node">
          <div className={boxClasses.concat(['SimpleTheme-general-node-padding']).join(' ')}>
            {mainText}
          </div>
        </div>
      );
    }
  };

  return {
    Application: ({ functionName, args }) => {
      return <GeneralNode mainText={<strong>{functionName}</strong>} children={args} boxClasses={['SimpleTheme-application-box']} />
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

    Expression: ({ marks, onSelect, onEdit, inside }) => {
      let exprClass = 'SimpleTheme-expression';

      return (
        <Selectable marks={marks} onSelect={onSelect} onEdit={onEdit} extraClassName={exprClass}>
          {inside}
        </Selectable>
      );
    },

    StreamReference: ({ name }) => (
      <GeneralNode mainText={name} boxClasses={['SimpleTheme-stream-reference-box']} />
    ),

    StreamIndirection: ({ name, child }) => {
      return <GeneralNode mainText={name} children={[{key: null, name: null, child}]} boxClasses={['SimpleTheme-stream-indirection-box']} />
    },

    UndefinedExpression: () => (
      <div className="SimpleTheme-undefined-expression">&nbsp;</div>
    ),

    NumberLiteral: ({ value }) => (
      <GeneralNode mainText={value} boxClasses={['SimpleTheme-number-literal-box']} />
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
  };
}
