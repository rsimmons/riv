# Riv

## Overview

#### NOTE: Riv is currently a proof of concept, and not ready for proper use

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
- The streams that are the inputs/outputs of functions are classified as one of two kinds, either *step streams* or *event streams* (ala [multi-kinded FRP](http://www.cs.nott.ac.uk/~psznhn/Publications/hosc2011.pdf)). This is explained in more detail later, but a step stream is conceptually a stream that always has a value (e.g. current mouse position), that changes as a "step function", whereas an event stream only has valid values in ephemeral moments (e.g. a keypress event). While one kind could be used to emulate the other, there are advantages in distinguishing them. (In React terms, callback props generally behave like (reverse) event streams, and other props generally behave like step streams).
- Per the previous point, a function that takes a step stream as input must treat it "idempotently". In other words, only the current value or changes to it matter, a function should not change its behavior if it is re-evaluated "extra" times with the same values. (In React terms, this is like how a component should only care about its current prop values, and be indifferent to how often it is re-rendered).
- Functions may "asynchronously" emit output changes, even if their inputs haven't changed, by subscribing to external events.

A Riv stream function is implemented by a simple Javascript function (not a class or object). Functions can maintain internal state or specify shutdown code using an API similar to [React Hooks](https://reactjs.org/docs/hooks-intro.html). The JS implementation of stream functions is on the honor system to follow the rule of not mutating inputs or outputs; this isn't verified or enforced.

_TODO: explain why rules lead to composability, by preventing backchannel. not necessary to outlaw side effects. making functions not first class avoids closure issues, etc._

## Relationship to Object-Oriented Programming

Riv does not have any traditional OOP notions of objects or classes. (Riv uses Javascript `Object`s as just "dumb" associative arrays, as in JSON). But Riv embodies many of the principles of object-oriented as articulated by the [inventor of OOP](https://en.wikipedia.org/wiki/Alan_Kay), arguably more than most ostensibly OOP languages. There's a [particular post](https://news.ycombinator.com/item?id=11812631) where he talks about his original thinking around OOP. Here are some quotes from that with commentary on how they relate to Riv:

> This led to an observation [...] that since you could divide up a computer into virtual computers intercommunicating ad infinitum you would (a) retain full power of expression, and (b) always be able to model anything that could be modeled, and (c) be able to scale cosmically beyond existing ways to divide up computers. [...] The big deal was encapsulation and messaging [...] Time sharing "processes" were already manifestations of such virtual machines but they lacked pragmatic universality because of their overheads.

So the basic idea is that objects are like miniature, encapsulated processes/computers that communicate via messages. A Riv stream function fits this description; they act as stateful processes, encapsulated from other stream functions, communicating only via discrete changes/events (messages) on their inputs and outputs.

In most object-oriented languages, the principle of encapsulation is violated. Messages sent to objects (often represented as method calls) take arguments that can themselves be mutable objects. If an object stores an argument that it received in a message, that argument may change without the object knowing, because it may be a reference to shared mutable object. Once a reference to a mutable object is shared between two objects, "backchannel communication" can happen between them without any message passing. This "spooky action at a distance" violates the principle of encapsulation.

Riv avoids this problem and ensures encapsulation by requiring that values passed between stream functions are immutable. The values may be complex data structures, but they are just "dumb" data, as is data exchanged between networked comptuers or operating system processes (notwithstanding shared memory).

> [drawing inpsiration from John McCarthy's temporal logic] From the individual point of view "values" are replaced by "histories" of values, and from the system point of view the whole system is represented by its stable state at each time the system is between computations.

Riv stream functions work with "streams" as inputs and outputs. Streams are conceptually the "histories of values" he describes, and they only change during discrete updates.

> The key notion here is that "time is a good idea" -- we want it, and we want to deal with it in safe and reasonable ways -- and most if not all of those ways can be purely functional transitions between sequences of stable world-line states.

Riv functions are (usually) pure functions between streams, when viewed as their full "world-line" time histories. (Riv does allow stream functions to have side effects, as it's useful in practice. But since inputs/outputs are immutable, these side effects don't generally violate encapsulation).

> In this model [...] "time doesn't exist between stable states": the "clock" only advances when each new state is completed. [...] This gives rise to a very simple way to do deterministic relationships that has an intrinsic and clean model of time.

Riv function definitions handle updates in this "synchronous" way, which is crucial to its design. Many "dataflow" languages (such as [Max](https://cycling74.com/products/max/) and [PD](https://puredata.info)) do _not_ operate this way. Spreadsheets _do_ operate in this way. An example is useful to understand what this means. Say that there are 4 streams A, B, C, and D in a diamond arrangement, where A depends on B and C, and B and C both depend on D. So when D changes, all of A, B, and C must update. But in what order does this happen? In Riv (like spreadsheets), B and C are both updated first, and A is only updated once using the latest values of B and C. In Max for example, B will update first, then A (using the new value of B but old value of C), then C, and then A again (using the new values of B and C). So in Riv or spreadsheets, the "clock" advances in a single update between consistent sets of values, whereas in Max there are several "sub-updates" that cause A to do two updates and momentarily see an inconsistent set of values.

> So, because I've always liked the "simulation perspective" on computing, I think of "objects" and "functions" as being complementary ideas and not at odds at all.

Riv effectively combines functions and objects into one unified notion of a stream function.
