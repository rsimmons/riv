// TODO: We could just make this an alias for {[key: string]: V}, use plain funcs instead of methods
export default class Environment<V> {
  private obj: {[key: string]: V};

  constructor(outer: Environment<V> | undefined = undefined) {
    this.obj = Object.create(outer ? outer.obj : null);
  }

  get(name: string): V | undefined {
    return this.obj[name];
  }

  set(name: string, value: V) {
    this.obj[name] = value;
  }

  delete(name: string): void {
    delete this.obj[name];
  }
}
