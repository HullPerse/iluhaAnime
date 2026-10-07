import { test } from 'vitest';

import {
  needsExactSeek,
  resolveLoadPosition,
  shouldSkipFrontendSeek,
} from '@/lib/player/resume.utils';

const RELOAD = { position: 321, paused: true };

test('resume decision path cost', async ({ bench }) => {
  const b1 = bench('resolveLoadPosition resume branch x50k', () => {
    let checksum = 0;
    for (let i = 0; i < 50000; i++) {
      checksum += resolveLoadPosition(null, 0, 100 + (i & 15), 200);
    }
    return checksum;
  });

  const b2 = bench('resolveLoadPosition entry branch x50k', () => {
    let checksum = 0;
    for (let i = 0; i < 50000; i++) {
      checksum += resolveLoadPosition(null, i & 3, 100, 200 + (i & 15));
    }
    return checksum;
  });

  const b3 = bench('resolveLoadPosition reload branch x50k', () => {
    let checksum = 0;
    for (let i = 0; i < 50000; i++) {
      checksum += resolveLoadPosition(RELOAD, 0, 100, 200);
    }
    return checksum;
  });

  const b4 = bench('needsExactSeek x50k', () => {
    let checksum = 0;
    for (let i = 0; i < 50000; i++) {
      checksum += needsExactSeek(null, i, i % 2 === 0) ? 1 : 0;
    }
    return checksum;
  });

  const b5 = bench('shouldSkipFrontendSeek x50k', () => {
    let checksum = 0;
    for (let i = 0; i < 50000; i++) {
      checksum += shouldSkipFrontendSeek(null, 100, 100 + (i & 1)) ? 1 : 0;
    }
    return checksum;
  });

  await bench.compare(b1, b2, b3, b4, b5, { time: 100, iterations: 3 });
});
