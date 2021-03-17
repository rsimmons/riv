// based on "Typing Haskell in Haskell" (http://web.cecs.pdx.edu/~mpj/thih/thih.pdf)

import { TypeVar, Type } from "./Types";

// A mapping from type variables to types. Note that substitutions only affect unquantified variables.
type Subst = Map<TypeVar, Type>;

// TODO: entry point that takes global natives and root tree function, and does inference
