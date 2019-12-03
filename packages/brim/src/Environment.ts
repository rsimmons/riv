export default class Environment<K, V> {
  private local: Map<K, V>;
  private outer: Environment<K, V> | undefined;

  constructor(outer: Environment<K, V> | undefined = undefined) {
    this.local = new Map();
    this.outer = outer;
  }

  has(key: K): boolean {
    return this.local.has(key) || (!!this.outer && this.outer.has(key));
  }

  get(key: K): V | undefined {
    return this.local.get(key) || (this.outer && this.outer.get(key));
  }

  set(key: K, value: V): void {
    this.local.set(key, value);
  }

  forEach(cb: (value: V, key: K, map: Map<K, V>) => void): void {
    this.local.forEach(cb);
    if (this.outer) {
      this.outer.forEach(cb);
    }
  }
}
