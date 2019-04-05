# Riv (*experimental/pre-release*)

Riv is a Javascript library for building reactive programs using declarative, composable stream-functions. It aims to be general purpose, suitable for any type of reactive program (e.g. audio/visual sketches) whether or not it involves a user interface.

[Check out a demo](https://rsimmons.github.io/riv/) with a few live example programs.

Riv is not directly related to React, but if you’re familiar with React (especially function components and hooks), it can help to [understand Riv by comparison](#compared-to-react).

Riv was most directly inspired by:
- [Functional reactive programming](https://en.wikipedia.org/wiki/Functional_reactive_programming) (FRP), especially the extensive work from the Haskell community
- Synchronous dataflow languages like Lucid Synchrone ([example programs](https://www.di.ens.fr/~pouzet/lucid-synchrone/manual_html/manual016.html)) and Lustre ([overview slides](http://www-verimag.imag.fr/~raymond/edu/eng/lustre-a.pdf))
- [React](https://reactjs.org/) (especially function components and hooks) and [Redux](https://redux.js.org/)
- Simplified graphics-oriented IDEs/languages like [Processing](https://processing.org/) and [NodeBox 1](https://www.nodebox.net/code/index.php/Home)
- Visual and block-based programming environments like [Max/MSP](https://cycling74.com/products/max/), [Scratch](https://scratch.mit.edu/) and [modular synthesizers](https://en.wikipedia.org/wiki/Modular_synthesizer)
- Good old spreadsheets, finite state machines and statecharts  

## Compared to React

Riv's approach to defining stream functions and its hooks interface was directly inspired by React function components and [hooks](https://reactjs.org/docs/hooks-intro.html). But there are some significant differences that set Riv apart. Roughly speaking, Riv is what you would get if you unified React function components and hooks into one "stream function" concept, and eliminated any inbuilt notion of rendering to a tree.

*(more coming soon)*
