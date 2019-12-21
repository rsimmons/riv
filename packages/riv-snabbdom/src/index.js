import { useVar, useInitialize } from 'riv-runtime';
const snabbdom = require('snabbdom');
const patch = snabbdom.init([
  require('snabbdom/modules/class').default,
  require('snabbdom/modules/attributes').default,
  require('snabbdom/modules/style').default,
  require('snabbdom/modules/eventlisteners').default,
]);
export const h = require('snabbdom/h').default; // helper function for creating vnodes

function cloneNode(vnode) {
  return {
    sel: vnode.sel,
    data: vnode.data,
    children: vnode.children && vnode.children.map(cloneNode),
    text: vnode.text,
    key: vnode.key,
    elm: vnode.elm, // I think this should be unset in our usage, since we only clone before passing to patch
  }
}

/**
 * Note that element is only read upon init
 */
export function renderDOMIntoElement(vnode, containerElement) {
  const savedContainerElement = useVar();
  const previousVnode = useVar();

  useInitialize(() => {
    return () => { // cleanup
      if (savedContainerElement.current) {
        savedContainerElement.current.innerHTML = ''; // I think we want to do this
      }
    };
  });

  if (!containerElement || !vnode) {
    return;
  }

  savedContainerElement.current = containerElement;

  // It's important that we clone the incoming vnode, because snabbdom will mutate it when we
  // pass it to patch.
  const clonedVnode = cloneNode(vnode);

  if (previousVnode.current) {
    patch(previousVnode.current, clonedVnode);
  } else {
    // First patch

    // Insert a dummy element because snabbdom replaces it (rather than inserting under)
    const elem = document.createElement('div');
    savedContainerElement.current.appendChild(elem);

    patch(elem, clonedVnode);
  }
  previousVnode.current = clonedVnode;
}

// selector may change, but once a valid one is passed, further changes will be ignored
export function renderDOMIntoSelector(vnode, containerSelector) {
  let containerElement;
  try {
    containerElement = document.querySelector(containerSelector);
  } catch (e) {
    // ignore
  }
  renderDOMIntoElement(vnode, containerElement);
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
