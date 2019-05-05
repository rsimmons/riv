
function Counter() {
  const [count, dispatch] = useReducer((prev, action) => {
    switch (action.type) {
      case 'increment':
        return prev + 1;
      case 'decrement':
        return prev - 1;
      default:
        throw new Error();
    }
  }, 0);

  return (
    <div>
      Count: {count}
      <button onClick={() => dispatch({type: 'increment'})}>+</button>
      <button onClick={() => dispatch({type: 'decrement'})}>-</button>
    </div>
  );
}

function Counter() {
  const [incCallback, incEvts] = makeCallback();
  const [decCallback, decEvts] = makeCallback();
  const count = useMultiReducer([
    [incEvts, n => n+1],
    [decEvts, n => n-1],
  ], 0);

  return (
    <div>
      Count: {count}
      <button on-click={incCallback}>+</button>
      <button on-click={decCallback}>-</button>
    </div>
  );
}

func foo() {
  const slider = () => {
    // ...
    return [vnode, value];
  };

  return (
    <div>{streamMap(slider, Array(sliderCount))}</div> // This doesn't work, we need to get values out
  );
}

