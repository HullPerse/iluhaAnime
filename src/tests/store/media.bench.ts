import { test, vi } from 'vitest';

vi.mock("@tauri-apps/api/core", () => ({
  invoke: () => Promise.resolve(null),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

import { createMediaSignalStore } from '@/store/media.store';

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


/**
 * Benchmarks for the media store (resume watch progress).
 *
 * Hot path on resume: getEntry(path) + persist read.
 * Watch path: setPosition every 5s per watched file.
 */

test('media store - entries', async ({ bench }) => {
  const b1 = bench('createMediaSignalStore + setPosition x1000', () => {
    const store = createMediaSignalStore({ getStorage: () => memoryStorage() });
    for (let i = 0; i < 1000; i++) {
      store.setPosition(`/media/ep${i % 50}.mkv`, i * 10, 600);
    }
  });

  const b2 = bench('setPosition on same path x10000 (watch loop)', () => {
    const store = createMediaSignalStore({ getStorage: () => memoryStorage() });
    const p = '/media/ep01.mkv';
    for (let i = 0; i < 10000; i++) {
      store.setPosition(p, i, 600);
    }
  });

  const b3 = bench('getEntry over 200 entries x50k', () => {
    const store = createMediaSignalStore({ getStorage: () => memoryStorage() });
    for (let k = 0; k < 200; k++) {
      store.setPosition(`/media/ep${k}.mkv`, k * 10, 600);
    }
    for (let i = 0; i < 50000; i++) {
      store.getEntry(`/media/ep${i % 200}.mkv`);
    }
  });

  await bench.compare(b1, b2, b3, { time: 100, iterations: 3 });
});

test('media store - persist mirror', async ({ bench }) => {
  const b1 = bench('entries mirror JSON x50k', () => {
    const store = createMediaSignalStore({ getStorage: () => memoryStorage() });
    for (let k = 0; k < 200; k++) {
      store.setPosition(`/media/ep${k}.mkv`, k * 10, 600);
    }
    let checksum = 0;
    for (let i = 0; i < 50000; i++) {
      const e = store.entries.get();
      checksum += JSON.stringify(e).length;
    }
    return checksum;
  });

  const b2 = bench('JSON.stringify same map x50k', () => {
    const e: Record<string, unknown> = {};
    for (let k = 0; k < 200; k++) e[`key_${k}`] = `val_${k}`;
    let checksum = 0;
    for (let i = 0; i < 50000; i++) {
      checksum += JSON.stringify(e).length;
    }
    return checksum;
  });

  await bench.compare(b1, b2, { time: 100, iterations: 3 });
});