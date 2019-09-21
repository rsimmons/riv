# Riv Runtime

## Intro

The Riv runtime lets you execute *Riv stream functions*.

Conceptually, a stream function is similar to an object (in the original OOP sense); a stream function can maintain state between calls, have external side effects (with a chance to clean them up), etc. The parameters of a stream function are meant to be thought of as *streams*. When they change in value, the caller should call the stream function with the latest values, to let the stream function know that the values have changed. This call is referred to as an "update".

In terms of the Riv JS implementation, a stream function is a regular JS function that obeys certain rules, and (optionally) calls Riv *hook* functions.

Stream functions are a useful abstraction because they let us cleanly compose dynamic/reactive behaviors.

## First Examples

Let's look at an example of a stream function:

```
function changeCount(v) {
  const count = useVar(0);
  const previous = useVar(v);

  if (v !== previous.current)) {
    count.current++;
  }
  previous.current = v;

  return count.current;
}
```

and it being called from a hypothetical REPL:

```
> const changeCountCtx = new ExecutionContext(changeCount);
> changeCountCtx.update('foo')
0
> changeCountCtx.update('foo')
0
> changeCountCtx.update('bar')
1
> changeCountCtx.update('baz')
2
> changeCountCtx.update('baz')
2
```

As its name implies, `changeCount` counts how many times its argument has changed value, and returns that count as its output. The implementation of `changeCount` uses the `useVar` hook, which stores a single value between calls. Before we can make use of the `changeCount` function we defined, we have to create an `ExecutionContext` for it. This context stores any state that the function has, and has some other features we will learn about later. When the we call the `.update()` method of the context, the arguments get passed through to the stream function the context is bound to.

Let's define a couple more stream functions:

```
function add(a, b) {
  return a + b;
}

function changeCountPlus100(v) {
  return add(100, changeCount(v));
}
```

and see how they behave:

```
> const changeCountPlus100Ctx = new ExecutionContext(changeCountPlus100)
> changeCountPlus100Ctx.update('foo')
100
> changeCountPlus100Ctx.update('foo')
100
> changeCountPlus100Ctx.update('bar')
101
> changeCountPlus100Ctx.update('baz')
102
> changeCountPlus100Ctx.update('baz')
102
```

The function `add` is an example of a stream function that doesn't call any hooks, but is still a valid stream function. But keep in mind that not _any_ JS function is a valid stream function, they must obey certain rules that we will explore later.

The function `changeCountPlus100` composes our previous two stream functions to make a new stream function, that behaves as we would expect.

## Rules to Riv By

Before going any further, let's introduce the rules that Riv stream functions definitions and stream function callers must obey to be considered "valid". Some of these won't fully make sense until you learn more about more features of Riv, but it's worth taking a look at them now.

Note that Riv does not (and cannot) *enforce* these rules; if you author a stream function that doesn't obey them, you will most likely encounter strange bugs.

Rules for definitions:

* A stream function must not mutate its arguments.
* A stream function must not mutate its return values after they have been returned (*unless certain more advanced rules are followed*)
* A stream function must use Riv hooks to store any state (e.g. as opposed to global variables), and must do any necessary cleanup of external effects upon termination (using yet-to-be-introduced hooks). Stream functions _may_ do I/O or have external effects, as long as they follow the previously mentioned rules.
* A stream function must not return a closure over its internal state (i.e. any function that refers to its internal variables). In general, it's best to avoid returning functions, or any nested data structure containing them.
* A stream function be be *idempotent* (in a Riv-specific sense). This means that it must be "indifferent" to being called "extra" times with the exact same arguments. Stream functions should only "react" to *changes* in their input values. (Further examples and the reasoning behind this will be given later)
* A stream function may take functions as parameters, and call them freely, as long as they are valid stream functions.

Rules for callers:

* If a stream function has function-parameters, the caller must only pass valid stream functions as arguments for those parameters. **Importantly**, the specific function passed _may change_, as long as it has the same *hook signature* as any previously passed functions. (This is subtle but important, and will be explained more later)
