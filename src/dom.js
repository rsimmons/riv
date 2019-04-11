import { useVar, useInitialize } from './riv';
const snabbdom = require('snabbdom');
const patch = snabbdom.init([
  require('snabbdom/modules/class').default,
  require('snabbdom/modules/attributes').default,
  require('snabbdom/modules/style').default,
  require('snabbdom/modules/eventlisteners').default,
]);
export const h = require('snabbdom/h').default; // helper function for creating vnodes

/**
 * Note that element is only read upon init
 */
export function renderDOMIntoElement(vnode, containerElement) {
  const savedContainerElement = useVar(containerElement);
  const previousVnode = useVar();

  useInitialize(() => {
    return () => { // cleanup
      savedContainerElement.current.innerHTML = ''; // I think we want to do this
    };
  });

  if (previousVnode.current) {
    patch(previousVnode.current, vnode);
  } else {
    // First patch

    // Insert a dummy element because snabbdom replaces it (rather than inserting under)
    const elem = document.createElement('div');
    savedContainerElement.current.appendChild(elem);

    patch(elem, vnode);
  }
  previousVnode.current = vnode;
}

/**
 * Note that selector is only read upon init
 */
export function renderDOMIntoSelector(vnode, containerSelector) {
  renderDOMIntoElement(vnode, document.querySelector(containerSelector)); // TODO: cache query
}

export function renderDOMAppendedToBody(vnode) {
  const savedContainerElement = useVar();

  useInitialize(() => {
    const containerElement = document.createElement('div');
    document.body.appendChild(containerElement);
    savedContainerElement.current = containerElement;

    return () => { // cleanup
      document.body.removeChild(containerElement);
    }
  });

  renderDOMIntoElement(vnode, savedContainerElement.current);
}
