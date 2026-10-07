import { test } from 'vitest';

import { createSignalStore } from '@/lib/state/signal.store';

interface BaselineState {
  value: number;
  counter: number;
  flag: boolean;
  arr: number[];
  str: string;
}

function createBaselineStore(initial: BaselineState) {
  let state: BaselineState = initial;
  const subs: Array<() => void> = [];
  return {
    subscribe(fn: () => void) {
      subs.push(fn);
      return () => subs.splice(subs.indexOf(fn), 1);
    },
    getState() {
      return state;
    },
    setState(next: Partial<BaselineState>) {
      // state clone like old zustand
      state = { ...state, ...next };
      subs.forEach((fn) => fn());
    },
  };
}


test('core store - single cell throughput (signal store vs zustand baseline)', async ({ bench }) => {
  const b1 = bench('signal store cell.set/get x50k', () => {
    const store = createSignalStore();
    const cell = store.cell(0);
    for (let i = 0; i < 50000; i++) {
      cell.set(i);
      cell.get();
    }
  });

  const b2 = bench('zustand baseline setState/getState x50k', () => {
    const store = createBaselineStore({ value: 0, counter: 0, flag: false, arr: [1, 2, 3], str: 'x' });
    let checksum = 0;
    for (let i = 0; i < 50000; i++) {
      store.setState({ value: i, counter: i });
      checksum += store.getState().value;
    }
    return checksum;
  });

  const b3 = bench('signal store cell.update/get x50k', () => {
    const store = createSignalStore();
    const cell = store.cell(0n);
    for (let i = 0n; i < 50000n; i++) {
      cell.update((prev) => prev + 1n);
      cell.get();
    }
  });

  await bench.compare(b1, b2, b3, { time: 100, iterations: 3 });
});

test('core store - derived cells (signal store vs zustand baseline)', { timeout: 120000 }, async ({ bench }) => {
  const b1 = bench('signal store derive chain (3 deep) x50k', () => {
    const store = createSignalStore();
    const base = store.cell(0);
    const a = store.derive([base], (args) => (args[0] as number) * 2);
    const b = store.derive([a], (args) => (args[0] as number) + 1);
    const c = store.derive([b], (args) => (args[0] as number) * 3);
    for (let i = 0; i < 50000; i++) {
      base.set(i);
      c.get();
    }
  });

  const b2 = bench('zustand baseline derive chain x50k', () => {
    const store = createBaselineStore({ value: 0, counter: 0, flag: false, arr: [], str: '' });
    let checksum = 0;
    for (let i = 0; i < 50000; i++) {
      store.setState({ value: i });
      checksum += store.getState().value * 2;
    }
    return checksum;
  });

  const b3 = bench('signal store 10 parallel derived from one cell x50k', () => {
    const store = createSignalStore();
    const base = store.cell(0);
    const derived = Array.from({ length: 10 }, (_, i) => store.derive([base], (args) => (args[0] as number) + i));
    for (let i = 0; i < 50000; i++) {
      base.set(i);
      derived.forEach((d) => d.get());
    }
  });

  await bench.compare(b1, b2, b3, { time: 100, iterations: 3 });
});

test('core store - subscribers / fan-out (signal store vs zustand baseline)', async ({ bench }) => {
  const b1 = bench('signal store 50 subscribers, cell.set x50k', () => {
    const store = createSignalStore();
    const cell = store.cell(0);
    const snapshot: number[] = [];
    for (let k = 0; k < 50; k++) {
      cell.subscribe(() => snapshot.push(cell.get()));
    }
    for (let i = 0; i < 50000; i++) {
      cell.set(i);
      snapshot.length = 0;
    }
  });

  const b2 = bench('zustand baseline 50 subscribers setState x50k', () => {
    const store = createBaselineStore({ value: 0, counter: 0, flag: false, arr: [], str: '' });
    const snapshot: number[] = [];
    for (let k = 0; k < 50; k++) {
      store.subscribe(() => snapshot.push(store.getState().value));
    }
    for (let i = 0; i < 50000; i++) {
      store.setState({ value: i });
      snapshot.length = 0;
    }
  });

  const b3 = bench('signal store 200 subscribers on one cell x50k', () => {
    const store = createSignalStore();
    const cell = store.cell(0);
    const unsubs: Array<() => void> = [];
    for (let k = 0; k < 200; k++) {
      unsubs.push(cell.subscribe(() => cell.get()));
    }
    for (let i = 0; i < 50000; i++) {
      cell.set(i);
    }
    unsubs.forEach((u) => u());
  });

  await bench.compare(b1, b2, b3, { time: 100, iterations: 3 });
});

test('core store - batching (signal store vs zustand baseline)', { timeout: 120000 }, async ({ bench }) => {
  const b1 = bench('signal store batch(50 writes) x50k', () => {
    const store = createSignalStore();
    const cells = Array.from({ length: 50 }, () => store.cell(0));
    const snapshot: number[] = [];
    cells.forEach((c) => c.subscribe(() => snapshot.push(c.get())));
    for (let i = 0; i < 50000; i++) {
      store.batch(() => cells.forEach((c, k) => c.set(k + i)));
      snapshot.length = 0;
    }
  });

  const b2 = bench('zustand baseline setState 50 fields x50k', () => {
    const fields: Record<string, number> = {};
    for (let k = 0; k < 50; k++) fields[`f${k}`] = 0;
    const store = createBaselineStore({ value: 0, counter: 0, flag: false, arr: [], str: '' });
    Object.assign(store.getState(), fields);
    const snapshot: number[] = [];
    store.subscribe(() => snapshot.push(store.getState().value));
    for (let i = 0; i < 50000; i++) {
      const next: Record<string, number> = {};
      for (let k = 0; k < 50; k++) next[`f${k}`] = k;
      store.setState(next as Partial<BaselineState>);
      snapshot.length = 0;
    }
  });

  const b3 = bench('signal store nested batch x50k', () => {
    const store = createSignalStore();
    const cell = store.cell(0);
    const snapshot: number[][] = [];
    cell.subscribe(() => snapshot.push([cell.get()]));
    for (let i = 0; i < 50000; i++) {
      store.batch(() => {
        cell.set(1);
        store.batch(() => {
          cell.set(2);
          cell.set(3);
        });
        cell.set(4);
      });
      snapshot.length = 0;
    }
  });

  await bench.compare(b1, b2, b3, { time: 100, iterations: 3 });
});

test('core store - subscribeAll (persist mirror path)', async ({ bench }) => {
  await bench('signal store subscribeAll + mirror write x50k', () => {
    const store = createSignalStore();
    const cells = Array.from({ length: 30 }, () => store.cell(0));
    let mirror: Record<string, unknown> = {};
    store.subscribeAll(() => {
      mirror = {};
      cells.forEach((c, k) => (mirror[`c${k}`] = c.get()));
    });
    let checksum = 0;
    for (let i = 0; i < 50000; i++) {
      store.batch(() => cells.forEach((c, k) => c.set(k + i)));
      checksum += mirror.c0 as number;
    }
    return checksum;
  }).run({ time: 100, iterations: 3 });
});
test('core store - derived clean reads (cached value)', async ({ bench }) => {
  const b1 = bench('signal store derive.get unchanged x50k', () => {
    const store = createSignalStore();
    const base = store.cell(0);
    const doubled = store.derive([base], (args) => (args[0] as number) * 2);
    doubled.get();
    let checksum = 0;
    for (let i = 0; i < 50000; i++) checksum += doubled.get();
    return checksum;
  });

  const b2 = bench('plain read plus recompute x50k', () => {
    const values = [0, 1];
    let checksum = 0;
    for (let i = 0; i < 50000; i++) checksum += values[i & 1] * 2;
    return checksum;
  });

  await bench.compare(b1, b2, { time: 100, iterations: 3 });
});
