import { test } from 'vitest';

import { createPersistor } from '@/lib/state/persist.utils';

function memoryStorage(backing = new Map<string, string>()) {
  return {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => backing.set(key, value),
    removeItem: (key: string) => backing.delete(key),
    clear: () => backing.clear(),
    key: () => null,
    get length() {
      return backing.size;
    },
  };
}

const SMALL = { a: 1, b: 'x', c: true, d: 12.5, e: [1, 2, 3] };

function smallPersistor() {
  const backing = new Map<string, string>();
  return {
    persistor: createPersistor({
      storeName: 'settings',
      schemaVersion: 39,
      getStorage: () => memoryStorage(backing),
    }),
    backing,
  };
}

function settingsPersistor() {
  const backing = new Map<string, string>();
  const persistor = createPersistor({
    storeName: 'settings',
    schemaVersion: 39,
    getStorage: () => memoryStorage(backing),
    now: () => 1700000000000,
  });
  const snapshot: Record<string, unknown> = {};
  for (let k = 0; k < 50; k++) snapshot[`field_${k}`] = `value_${k}`;
  return { persistor, snapshot, backing };
}

test('persist layer - JSON wire cost', async ({ bench }) => {
  const b1 = bench('persistor write + flush x50k', () => {
    const { persistor } = smallPersistor();
    for (let i = 0; i < 50000; i++) {
      persistor.write(SMALL);
      persistor.flush();
    }
  });

  const b2 = bench('JSON.stringify mirror small vs large x50k', () => {
    const LARGE: Record<string, unknown> = {};
    for (let k = 0; k < 50; k++) LARGE[`field_${k}`] = `value_${k}`;
    for (let i = 0; i < 50000; i++) {
      JSON.stringify(SMALL);
      JSON.stringify(LARGE);
    }
  });

  const b3 = bench('persistor write + flush full settings x50k', () => {
    const { persistor, snapshot } = settingsPersistor();
    for (let i = 0; i < 50000; i++) {
      persistor.write(snapshot);
      persistor.flush();
    }
  });

  await bench.compare(b1, b2, b3, { time: 100, iterations: 3 });
});

test('persist layer - write rate with debounce', async ({ bench }) => {
  const BACKING = new Map<string, string>();

  const b1 = bench('write x10000 with 250ms debounce', () => {
    const persistor = createPersistor({
      storeName: 'watch',
      schemaVersion: 0,
      getStorage: () => memoryStorage(BACKING),
      now: () => 1700000000000,
      debounceMs: 250,
    });
    let _flushed = 0;
    persistor.flush = () => { _flushed++; };
    for (let i = 0; i < 10000; i++) {
      persistor.write({ pos: i });
    }
  });

  const b2 = bench('write x10000 no debounce', () => {
    const persistor = createPersistor({
      storeName: 'watch',
      schemaVersion: 0,
      getStorage: () => memoryStorage(BACKING),
      now: () => 1700000000000,
      debounceMs: 0,
    });
    let _flushed = 0;
    persistor.flush = () => { _flushed++; };
    for (let i = 0; i < 10000; i++) {
      persistor.write({ pos: i });
    }
  });

  await bench.compare(b1, b2, { time: 100, iterations: 3 });
});

test('persist layer - read cost', async ({ bench }) => {
  const BACKING = new Map<string, string>();
  const key = 'iluha.v1.watch';
  const payload = JSON.stringify({
    f: 1,
    store: 'watch',
    sv: 0,
    ts: 1700000000000,
    data: { pos: 42.5, duration: 1234, subOffset: 0 },
  });
  BACKING.set(key, payload);

  const b1 = bench('persistor read parse + guards x50k', () => {
    const persistor = createPersistor({
      storeName: 'watch',
      schemaVersion: 0,
      getStorage: () => memoryStorage(BACKING),
      now: () => 1700000000000,
    });
    for (let i = 0; i < 50000; i++) {
      persistor.read();
    }
  });

  const b2 = bench('JSON.parse mirror snapshot x50k', () => {
    const snapshot = JSON.parse(payload);
    let checksum = 0;
    for (let i = 0; i < 50000; i++) {
      checksum += snapshot.data.pos;
    }
    return checksum;
  });

  await bench.compare(b1, b2, { time: 100, iterations: 3 });
});