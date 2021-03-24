export default class Environment<K, V> {
  private local: Map<K, V>;
  private outer: Environment<K, V> | undefined;

  constructor(outer?: Environment<K, V>, local?: Map<K, V>) {
    this.local = local || new Map();
    this.outer = outer;
  }

  has(key: K): boolean {
    return this.local.has(key) || (!!this.outer && this.outer.has(key));
  }

  get(key: K): V | undefined {
    return this.local.has(key) ? this.local.get(key) : (this.outer ? this.outer.get(key) : undefined);
  }

  getExisting(key: K): V {
    if (!this.has(key)) {
      throw new Error();
    }
    return this.get(key)!;
  }

  set(key: K, value: V): void {
    this.local.set(key, value);
  }

  setNew(key: K, value: V): void {
    if (this.has(key)) {
      throw new Error();
    }
    this.set(key, value);
  }

  setExisting(key: K, value: V): void {
    if (!this.local.has(key)) {
      throw new Error();
    }
    this.set(key, value);
  }

  delete(key: K): boolean {
    if (this.outer && this.outer.has(key)) {
      throw new Error(); // prevent bugs
    }
    return this.local.delete(key);
  }

  forEach(cb: (value: V, key: K, map: Map<K, V>) => void): void {
    this.local.forEach(cb);
    if (this.outer) {
      this.outer.forEach(cb);
    }
  }

  entriesArray(): Array<[K, V]> {
    let entries = [...this.local.entries()];
    if (this.outer) {
      entries = entries.concat(this.outer.entriesArray());
    }
    return entries;
  }
}
