import { test } from 'vitest';

import {
  createPlaybackSignalStore,
  createPlayerSignalStore,
} from '@/store/player.store';

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

const SNAPSHOT = {
  path: '/media/ep01.mkv',
  timePos: 1234.5,
  duration: 7200,
  pause: false,
  volume: 0.8,
  eofReached: false,
  speed: 1,
  muted: false,
  playlistIndex: 0,
  playlistCount: 12,
  fpsRender: 60,
  fpsVideo: 24,
  dropCount: 3,
  cacheDuration: 4,
  hwdecCurrent: 'cuda',
  videoWidth: 1920,
  videoHeight: 1080,
};


test('player store - settings atoms', async ({ bench }) => {
  const b1 = bench('patch + setVolume x50k', () => {
    const store = createPlayerSignalStore({ getStorage: () => memoryStorage() });
    for (let i = 0; i < 50000; i++) {
      store.setVolume(i % 100 / 50);
      store.patchPlayerSettings({ rotation: i, zoom: i / 10 });
    }
  });

  const b2 = bench('snapshot: read mirror x50k', () => {
    const store = createPlayerSignalStore({ getStorage: () => memoryStorage() });
    let checksum = 0;
    for (let i = 0; i < 50000; i++) {
      const snap = store.snapshot();
      checksum += snap.volume;
    }
    return checksum;
  });

  await bench.compare(b1, b2, { time: 100, iterations: 3 });
});

test('player store - playback snapshot path (hot)', async ({ bench }) => {
  const b1 = bench('playback setSnapshot x50k (timePos varies)', () => {
    const store = createPlaybackSignalStore();
    for (let i = 0; i < 50000; i++) {
      store.setSnapshot({ ...SNAPSHOT, timePos: 100 + i });
    }
  });

  const b2 = bench('setSnapshot + settle: unreached target kept x50k', () => {
    const store = createPlaybackSignalStore();
    store.setSeekTarget(1e6);
    for (let i = 0; i < 50000; i++) {
      store.setSnapshot({ ...SNAPSHOT, timePos: 100 + i });
    }
  });

  const b3 = bench('setSnapshot + settle: file change clears target x50k', () => {
    const store = createPlaybackSignalStore();
    store.setSeekTarget(600);
    for (let i = 0; i < 50000; i++) {
      store.setSnapshot({ ...SNAPSHOT, path: `/media/ep${i % 12}.mkv`, timePos: 100 + i });
    }
  });

  await bench.compare(b1, b2, b3, { time: 100, iterations: 3 });
});

test('player store - seek target timer', async ({ bench }) => {
  await bench('setSeekTarget + settleSeek x50k', () => {
    const store = createPlaybackSignalStore();
    for (let i = 0; i < 50000; i++) {
      store.setSeekTarget(i);
      store.settleSeek();
    }
  }).run({ time: 100, iterations: 3 });
});