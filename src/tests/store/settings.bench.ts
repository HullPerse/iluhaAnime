import { test, vi } from 'vitest';

vi.mock("@tauri-apps/api/core", () => ({
  invoke: () => Promise.resolve(null),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

import { createSettingsSignalStore } from '@/store/settings.store';

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


test('settings store - patch route', async ({ bench }) => {
  const b1 = bench('patch full settings object x50k', () => {
    const store = createSettingsSignalStore({ getStorage: () => memoryStorage() });
    for (let i = 0; i < 50000; i++) {
      store.patch({ pageSize: i % 2 === 0 ? 40 : 80, modalAnimation: i % 2 === 0 });
    }
  });

  const b2 = bench('patch incremental subset x50k', () => {
    const store = createSettingsSignalStore({ getStorage: () => memoryStorage() });
    for (let i = 0; i < 50000; i++) {
      store.patch({ windowEffect: i % 2 === 0 ? 'mica' : 'acrylic', customTitleBarEnabled: i % 2 === 0 });
    }
  });

  await bench.compare(b1, b2, { time: 100, iterations: 3 });
});

test('settings store - snapshot + persist mirror', async ({ bench }) => {
  const b1 = bench('snapshot: read mirror x50k', () => {
    const store = createSettingsSignalStore({ getStorage: () => memoryStorage() });
    let checksum = 0;
    for (let i = 0; i < 50000; i++) {
      const snap = store.snapshot();
      checksum += snap.pageSize;
    }
    return checksum;
  });

  const b2 = bench('patch + snapshot + subscribeAll x50k', () => {
    const store = createSettingsSignalStore({ getStorage: () => memoryStorage() });
    let events = 0;
    store.subscribeAll(() => events++);
    for (let i = 0; i < 50000; i++) {
      store.patch({ retroStyle: i % 2 === 0 ? 'classic' : 'soft', customScrollbar: i % 3 === 0 });
      store.snapshot();
    }
  });

  await bench.compare(b1, b2, { time: 100, iterations: 3 });
});

test('settings store - big snapshot serialization', async ({ bench }) => {
  await bench('JSON.stringify a full settings snapshot x50k', () => {
    const snapshot: Record<string, unknown> = {};
    for (let k = 0; k < 39; k++) snapshot[`field_${k}`] = `value_${k}`;
    for (let i = 0; i < 50000; i++) {
      JSON.stringify(snapshot);
    }
  }).run({ time: 100, iterations: 3 });
});