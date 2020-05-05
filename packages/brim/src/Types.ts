// based on "Typing Haskell in Haskell" (http://web.cecs.pdx.edu/~mpj/thih/thih.pdf)
/**
 * Because we don't support typeclasses, it seems that we can simply on the above code.
 * Also, we don't do curried application. I'm pretty sure this is safe to make these changes:
 * - type variables (quantified or not) cannot have kinds other than *. therefore we don't need
 *   to track their kind/arity
 * - normally we need a "type scheme" record to track the kinds of quantified variables, but
 *   we don't need that any more. so a "scheme" can be the same record as a type.
 * - the ctor (left side) in type-applications cannot be a variable. therefore it can just be
 *   a specific type id instead of itself a type
 *
 * This means we can't write something like:
 * --
 * class Functor f where
 *   fmap :: (a -> b) -> f a -> f b
 * --
 * because f is used as a type variable with the kind * -> *.
 */

export type TypeID = string;

export interface TypeCtorInfo {
  readonly tid: TypeID;
  readonly arity: number;
}

// note that this is the application of a type constructor, not a Riv-function
export interface TypeApp {
  readonly kind: 'app';
  readonly ctor: TypeID;
  readonly args: ReadonlyArray<Type>;
}

// this is only for un-qualified variables
export interface TypeVar {
  readonly kind: 'var';
  readonly vid: number;
}

// quantified variable
export interface TypeQVar {
  readonly kind: 'qvar';
  readonly idx: number;
}

// note that these "value" types do not include functions, functions are not first-class
export type Type = TypeApp | TypeVar | TypeQVar;

export interface FunctionType {
  readonly sargs: ReadonlyArray<Type>;
  readonly fargs: ReadonlyArray<FunctionType>;
  readonly yields: ReadonlyArray<Type>;
}
