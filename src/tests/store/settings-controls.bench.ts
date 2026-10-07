import { test, vi } from 'vitest';

vi.mock("@tauri-apps/api/core", () => ({
  invoke: () => Promise.resolve(null),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

import { transformOptions } from '@/lib/player/playback.utils';
import { DEFAULT_PLAYER_SETTINGS } from '@/store/player.store';
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

test('settings patch cost by value kind x50k', async ({ bench }) => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['number field', { pageSize: 42 }],
    ['boolean field', { customScrollbar: true }],
    ['string field', { defaultSearchSource: 'nyaa' }],
    ['object field', { limits: { download: 100, upload: 50 } }],
    ['array field', { videoExtensions: ['mkv', 'mp4', 'avi'] }],
  ];
  const regs = cases.map(([name, partial]) =>
    bench(`patch ${name}`, () => {
      const store = createSettingsSignalStore({ getStorage: () => memoryStorage() });
      const patch = partial as unknown as Parameters<typeof store.patch>[0];
      let checksum = 0;
      for (let i = 0; i < 50000; i++) {
        store.patch(patch);
        checksum += 1;
      }
      return checksum;
    })
  );

  await bench.compare(...regs, { time: 100, iterations: 3 });
});

test('transformOptions per expensive option (delta vs default)', async ({ bench }) => {
  const variants: Array<[string, typeof DEFAULT_PLAYER_SETTINGS]> = [
    ['default', DEFAULT_PLAYER_SETTINGS],
    ['sepia 100', { ...DEFAULT_PLAYER_SETTINGS, sepia: 100 }],
    ['blur 20', { ...DEFAULT_PLAYER_SETTINGS, blur: 20 }],
    ['grayscale 100', { ...DEFAULT_PLAYER_SETTINGS, grayscale: 100 }],
    ['flipH+flipV', { ...DEFAULT_PLAYER_SETTINGS, flipH: true, flipV: true }],
  ];
  const regs = variants.map(([name, settings]) =>
    bench(`transformOptions ${name} x50k`, () => {
      let checksum = 0;
      for (let i = 0; i < 50000; i++) {
        checksum += Object.keys(transformOptions(settings)).length;
      }
      return checksum;
    })
  );

  await bench.compare(...regs, { time: 100, iterations: 3 });
});
