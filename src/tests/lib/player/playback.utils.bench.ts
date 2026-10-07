import { test } from 'vitest';

import {
  audioOptions,
  buildInitialOptions,
  colorOptions,
  hdrOptions,
  parseTimecode,
  profileOptions,
  rotateQueue,
  transformOptions,
} from '@/lib/player/playback.utils';
import { DEFAULT_PLAYER_SETTINGS } from '@/store/player.store';
import type { PlayerSettings } from '@/types/videoPlayer';

const HEAVY: PlayerSettings = {
  ...DEFAULT_PLAYER_SETTINGS,
  flipH: true,
  flipV: true,
  blur: 20,
  grayscale: 100,
  sepia: 100,
  subFontSize: 24,
};

const TIMECODE_CASES = [
  '01:23:45',
  '12:34',
  '83:12.5',
  '1:02:03,500',
  '  5:00  ',
  'not a time',
  '12:99',
  '1:2:3:4',
  '',
  '12,5',
];

test('playback options - transformOptions (settings slider path)', async ({ bench }) => {
  const b1 = bench('transformOptions default x50k', () => {
    let checksum = 0;
    for (let i = 0; i < 50000; i++) {
      checksum += Object.keys(transformOptions(DEFAULT_PLAYER_SETTINGS)).length;
    }
    return checksum;
  });

  const b2 = bench('transformOptions all filters on x50k', () => {
    let checksum = 0;
    for (let i = 0; i < 50000; i++) {
      checksum += Object.keys(transformOptions(HEAVY)).length;
    }
    return checksum;
  });

  const b3 = bench('buildInitialOptions x50k', () => {
    let checksum = 0;
    for (let i = 0; i < 50000; i++) {
      checksum += Object.keys(
        buildInitialOptions({ volume: 0.8, hwdec: 'auto-safe', settings: DEFAULT_PLAYER_SETTINGS })
      ).length;
    }
    return checksum;
  });

  await bench.compare(b1, b2, b3, { time: 100, iterations: 3 });
});

test('playback options - profile/hdr/color/audio', async ({ bench }) => {
  const b1 = bench('profileOptions x3 profiles x20k', () => {
    let checksum = 0;
    for (let i = 0; i < 20000; i++) {
      checksum += Object.keys(profileOptions('basic')).length;
      checksum += Object.keys(profileOptions('speed')).length;
      checksum += Object.keys(profileOptions('quality')).length;
    }
    return checksum;
  });

  const b2 = bench('hdrOptions auto+manual x50k', () => {
    let checksum = 0;
    for (let i = 0; i < 50000; i++) {
      checksum += Object.keys(hdrOptions(DEFAULT_PLAYER_SETTINGS)).length;
      checksum += Object.keys(hdrOptions({ ...DEFAULT_PLAYER_SETTINGS, toneMap: 'manual' })).length;
    }
    return checksum;
  });

  const b3 = bench('colorOptions+audioOptions x50k', () => {
    let checksum = 0;
    for (let i = 0; i < 50000; i++) {
      checksum += Object.keys(colorOptions(DEFAULT_PLAYER_SETTINGS)).length;
      checksum += Object.keys(audioOptions(DEFAULT_PLAYER_SETTINGS)).length;
    }
    return checksum;
  });

  await bench.compare(b1, b2, b3, { time: 100, iterations: 3 });
});

test('playback queue/timecode helpers', async ({ bench }) => {
  const files = Array.from({ length: 2000 }, (_, i) => `/media/s01/ep${i}.mkv`);

  const b1 = bench('rotateQueue 2000 files x5k', () => {
    let checksum = 0;
    for (let i = 0; i < 5000; i++) {
      checksum += rotateQueue(files, 1000 + (i % 500)).length;
    }
    return checksum;
  });

  const b2 = bench('parseTimecode table x20k', () => {
    let checksum = 0;
    for (let i = 0; i < 20000; i++) {
      const parsed = parseTimecode(TIMECODE_CASES[i % TIMECODE_CASES.length]);
      checksum += parsed ?? -1;
    }
    return checksum;
  });

  await bench.compare(b1, b2, { time: 100, iterations: 3 });
});
