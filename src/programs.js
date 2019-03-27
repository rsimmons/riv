import { useVar, useRequestUpdate, useInitialize } from './chinook';

function displayAsString(v) {
  const elem = useVar(null);

  useInitialize(() => {
    elem.current = document.createElement('div');
    elem.current.style.cssText = 'position: absolute; top: 0; right: 0; pointer-events: none; background: white; border: 1px solid red; color: black; font-size: 24px; padding: 5px';
    elem.current.textContent = '(undefined)';
    document.body.appendChild(elem.current);

    return () => { // cleanup
      document.body.removeChild(elem.current);
    }
  })

  elem.current.textContent = (v === undefined) ? '(undefined)' : v.toString();
}

function animationTime() {
  const requestUpdate = useRequestUpdate();
  const time = useVar();
  const reqId = useVar();

  useInitialize(() => {
    const onFrame = (t) => {
      time.current = 0.001*t;
      reqId.current = requestAnimationFrame(onFrame); // request another
      requestUpdate();
    };

    time.current = 0.001*performance.now();
    reqId.current = requestAnimationFrame(onFrame);

    return () => { // cleanup
      cancelAnimationFrame(reqId.current);
    }
  });

  return time.current;
}

function countEvents(e) {
  const count = useVar(0);

  if (e) { // e will be a boxed value if present, undefined if not
    count.current++;
  }

  return count.current;
}

/*
function mouseClicks() {
  const requestUpdate = useRequestUpdate();
  const queued = useVar();

  useInitialize(() => {
    const onMouseDown = () => {
      requestUpdate();
    }
    document.addEventListener('mousedown', onMouseDown);

    return () => { // cleanup
      document.removeEventListener('mousedown', onMouseDown);
    }
  })
}

function mouseClicks2() {
  return useAsync(asyncOutput => {
    useInitialize(() => {
      const onMouseDown = () => {
        asyncOutput({}); // emit unit event
      }
      document.addEventListener('mousedown', onMouseDown);

      return () => { // cleanup
        document.removeEventListener('mousedown', onMouseDown);
      }
    });
  });
}
*/

export default [
  {
    name: 'do nothing',
    main: () => {
    },
  },

  {
    name: 'animation time',
    main: () => {
      displayAsString(animationTime());
    },
  },

/*
  {
    name: 'count clicks',
    main: () => {
      displayAsString(countEvents(mouseClicks()));
    },
  },
*/
]
