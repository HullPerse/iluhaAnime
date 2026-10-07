export type Unsubscriber = () => void;

interface Sub {
  fn: () => void;
  lastTx: number;
}

interface BaseRec {
  id: number;
  version: number;
  subs: Sub[];
  queued: boolean;
  rev: Set<DerivedRec>;
}

interface CellRec extends BaseRec {
  kind: "cell";
  value: unknown;
}

interface DerivedRec extends BaseRec {
  kind: "derived";
  deps: NodeRec[];
  compute: (args: unknown[]) => unknown;
  cached: unknown;
  hasValue: boolean;
  depVersions: number[];
}

type NodeRec = CellRec | DerivedRec;

export interface Cell<T> {
  readonly id: number;
  get: () => T;
  set: (value: T) => void;
  update: (fn: (prev: T) => T) => void;
  subscribe: (fn: () => void) => Unsubscriber;
}

export interface Derived<T> {
  get: () => T;
  subscribe: (fn: () => void) => Unsubscriber;
}

export interface Readable<T> {
  get: () => T;
  subscribe: (fn: () => void) => Unsubscriber;
}

export interface SignalStore {
  cell: <T>(initial: T) => Cell<T>;
  atom: <T>(key: string, initial: T) => Cell<T>;
  derive: <T>(deps: Readable<unknown>[], fn: (args: unknown[]) => T) => Derived<T>;
  batch: (fn: () => void) => void;
  snapshot: () => Record<string, unknown>;
  subscribeAll: (fn: () => void) => Unsubscriber;
}

function pullDerived(rec: DerivedRec, resolving: Set<DerivedRec>): unknown {
  refreshDerived(rec, resolving);
  return rec.cached;
}

function refreshDerived(rec: DerivedRec, resolving: Set<DerivedRec>): boolean {
  if (resolving.has(rec)) throw new Error("signal cycle detected");
  let stale = !rec.hasValue;
  const args: unknown[] = Array.from({ length: rec.deps.length });
  resolving.add(rec);
  try {
    for (let i = 0; i < rec.deps.length; i++) {
      const dep = rec.deps[i];
      args[i] = dep.kind === "cell" ? dep.value : pullDerived(dep, resolving);
      if (dep.version !== rec.depVersions[i]) stale = true;
    }
    if (!stale) return false;
    const value = rec.compute(args);
    const changed = !rec.hasValue || !Object.is(value, rec.cached);
    rec.cached = value;
    rec.hasValue = true;
    for (let i = 0; i < rec.deps.length; i++) rec.depVersions[i] = rec.deps[i].version;
    if (changed) rec.version++;
    return changed;
  } finally {
    resolving.delete(rec);
  }
}

function hasDownstream(rec: BaseRec): boolean {
  if (rec.subs.length > 0) return true;
  for (const child of rec.rev) {
    if (hasDownstream(child)) return true;
  }
  return false;
}

export function createSignalStore(): SignalStore {
  let nextId = 0;
  let tx = 0;
  let depth = 0;
  const queue: NodeRec[] = [];
  let qHead = 0;
  const resolving = new Set<DerivedRec>();
  const handles = new WeakMap<Readable<unknown>, NodeRec>();
  const atoms = new Map<string, Cell<unknown>>();
  const storeSubs: Sub[] = [];

  const enqueue = (node: NodeRec): void => {
    if (node.queued) return;
    node.queued = true;
    queue.push(node);
  };

  const notifySubs = (subs: Sub[], runTx: number): void => {
    for (const sub of subs) {
      if (sub.lastTx !== runTx) {
        sub.lastTx = runTx;
        sub.fn();
      }
    }
  };

  const flush = (): void => {
    if (queue.length === 0) return;
    const runTx = ++tx;
    while (qHead < queue.length) {
      const node = queue[qHead++];
      node.queued = false;
      if (node.kind === "cell") {
        notifySubs(node.subs, runTx);
        continue;
      }
      if (!hasDownstream(node)) continue;
      if (refreshDerived(node, resolving)) notifySubs(node.subs, runTx);
    }
    queue.length = 0;
    qHead = 0;
    notifySubs(storeSubs, runTx);
  };

  const markDownstream = (node: BaseRec): void => {
    for (const child of node.rev) {
      if (!hasDownstream(child)) continue;
      enqueue(child);
      markDownstream(child);
    }
  };

  const subscribeTo = (rec: BaseRec, fn: () => void): Unsubscriber => {
    const sub: Sub = { fn, lastTx: -1 };
    rec.subs.push(sub);
    return () => {
      const index = rec.subs.indexOf(sub);
      if (index !== -1) rec.subs.splice(index, 1);
    };
  };

  const makeCell = <T>(initial: T): Cell<T> => {
    const rec: CellRec = {
      kind: "cell",
      id: nextId++,
      version: 0,
      value: initial,
      subs: [],
      queued: false,
      rev: new Set(),
    };
    const handle: Cell<T> = {
      id: rec.id,
      get: () => rec.value as T,
      set: (value: T) => {
        if (Object.is(rec.value, value)) return;
        rec.value = value;
        rec.version++;
        markDownstream(rec);
        enqueue(rec);
        if (depth === 0) flush();
      },
      update: (fn) => handle.set(fn(rec.value as T)),
      subscribe: (fn) => subscribeTo(rec, fn),
    };
    handles.set(handle, rec);
    return handle;
  };

  const derive = <T>(deps: Readable<unknown>[], fn: (args: unknown[]) => T): Derived<T> => {
    const depRecs = deps.map((dep) => {
      const rec = handles.get(dep);
      if (!rec) throw new Error("derive: dependency belongs to another store");
      return rec;
    });
    const rec: DerivedRec = {
      kind: "derived",
      id: nextId++,
      version: 0,
      subs: [],
      queued: false,
      rev: new Set(),
      deps: depRecs,
      compute: fn as (args: unknown[]) => unknown,
      cached: undefined,
      hasValue: false,
      depVersions: depRecs.map(() => -1),
    };
    for (const dep of depRecs) dep.rev.add(rec);
    const handle: Derived<T> = {
      get: () => {
        refreshDerived(rec, resolving);
        return rec.cached as T;
      },
      subscribe: (listener) => subscribeTo(rec, listener),
    };
    handles.set(handle, rec);
    return handle;
  };

  return {
    cell: makeCell,
    atom: <T>(key: string, initial: T): Cell<T> => {
      const existing = atoms.get(key);
      if (existing) return existing as Cell<T>;
      const created = makeCell(initial);
      atoms.set(key, created as Cell<unknown>);
      return created;
    },
    derive,
    batch: (fn) => {
      depth++;
      try {
        fn();
      } finally {
        depth--;
        if (depth === 0) flush();
      }
    },
    snapshot: () => {
      const out: Record<string, unknown> = {};
      for (const [key, handle] of atoms) out[key] = handle.get();
      return out;
    },
    subscribeAll: (fn) => {
      const sub: Sub = { fn, lastTx: -1 };
      storeSubs.push(sub);
      return () => {
        const index = storeSubs.indexOf(sub);
        if (index !== -1) storeSubs.splice(index, 1);
      };
    },
  };
}
