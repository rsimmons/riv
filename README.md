# Riv

## NOTE: Riv is currently a proof of concept, and not ready for proper use

## Overview

Riv is a programming language focused on building reactive programs out of cleanly composable "stream functions". It's declarative, functional (with some twists), and most directly inspired by dataflow programming, functional reactive programming, spreadsheets, and [React](https://reactjs.org/). It's particularly aimed at lightweight interactive/exploratory programming, ala [notebook environments](https://en.wikipedia.org/wiki/Notebook_interface), [Max](https://cycling74.com/products/max/)/[PD](https://puredata.info), [Processing](https://processing.org), [Scratch](https://scratch.mit.edu), etc.

Riv is built on top of Javascript. It inherits many basic features of JS, and interoperates with JS code. But in contrast to JS, it adds some important restrictions involving immutability, idempotence, calling conventions, etc. and adds a small runtime and API. These extra restrictions compared to vanilla JS facilitate the safe composition of stream functions as black boxes, in the original spirit of object-oriented programming but without any of the typical notions of objects or classes.

There are two ways to make Riv programs and libraries:
- Riv-js: You write Javascript in your usual editor, but adhering to certain rules and making use of the riv-runtime library (which has an API with similarities to React Hooks). In this form, Riv is basically an embedded domain-specific language. [Check out some live examples](https://rsimmons.github.io/riv/js-api-demos/).
- Brim: A browser-based IDE featuring a structured, live editor that's specific to Riv.

Riv flows from an unusual set of design decisions that leads to clean composability and other nice properties:
- Functions are automatically "re-evaluated" when their inputs change (ala a spreadsheet cell, a node in a dataflow graph, or a React component). Conceptually they take input *streams* and yield output *streams*, and are therefore often interchangeably referred to as "stream functions" to distinguish them from regular JS functions.
- Functions may hold internal state between re-evaluations.
- Functions can not mutate their arguments or return values (after they are returned). In other words, values passed between stream functions are immutable.
- Functions may have side effects, e.g. perform input/output (as long as they don't violate the previous rule).
- Functions may specify cleanup actions to be taken when they are "shut down" (e.g. clearing timers, removing elements from the DOM).
- Functions are _not_ first class (they cannot be manipulated as normal values), but they _can_ be passed as function-arguments to other functions (in fact Riv relies extensively on higher-order functions).
- The streams that are the inputs/outputs of functions are classified as either *step streams* and *event streams* (ala [multi-kinded FRP](http://www.cs.nott.ac.uk/~psznhn/Publications/hosc2011.pdf)). This is explained in more detail later, but a step stream is conceptually a stream that always has a value (e.g. current mouse position), that changes as a "step function", whereas an event stream only has valid values in ephemeral moments (e.g. a keypress event). While one type could be used to emulate the other, there are advantages in distinguishing them. (In React terms, callback props generally behave like (reverse) event streams, and other props generally behave like step streams).
- Per the previous point, a function that takes a step stream as input must treat it "idempotently". In other words, only the current value or changes to it matter, a function should not change its behavior if it is re-evaluated "extra" times with the same values. (In React terms, this is like how a component should only care about its current prop values, and be indifferent to how often it is re-rendered).

A Riv stream function is implemented by a simple Javascript function (not a class or object). Functions can maintain internal state or specify shutdown code using an API similar to [React Hooks](https://reactjs.org/docs/hooks-intro.html). The JS implementation of stream functions is on the honor system to follow the rule of not mutating inputs or outputs; this isn't verified or enforced.

_TODO: explain why rules lead to composability, by preventing backchannel. not necessary to outlaw side effects. making functions not first class avoids closure issues, etc._
