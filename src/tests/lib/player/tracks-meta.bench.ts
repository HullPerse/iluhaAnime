import { test } from 'vitest';

import { getCachedCard, orderCardPaths } from '@/lib/player/cardCache.utils';
import { languageName, normalizeLangCode } from '@/lib/player/language.utils';
import { shouldShowEmptyPlayer, shouldShowLoadingSpinner } from '@/lib/player/loading.utils';
import { findActiveChapter, skipLabel } from '@/lib/player/skip.utils';
import {
  sortTracksByLanguage,
  toTrackDisplay,
  trackLabel,
} from '@/lib/player/tracks.utils';
import { isPlayerPathHidden, normalizePlayerPath } from '@/lib/player/visibility.utils';
import { formatClock } from '@/lib/utils/time.utils';
import type { MpvChapter, MpvTrack } from '@/types/videoPlayer';

const LANGS = ['eng', 'jpn', 'rus', 'und', 'fre', 'ger', 'spa', 'ita', 'chi', 'kor', 'mis', undefined];

function makeTracks(): MpvTrack[] {
  const tracks: MpvTrack[] = [];
  const langs = ['eng', 'jpn', 'rus', 'und', 'fre', 'ger', 'spa', 'chi'];
  for (let i = 0; i < 8; i++) {
    tracks.push({
      id: i + 1,
      type: 'audio',
      lang: langs[i],
      title: i % 2 === 0 ? `Surround 5.1 [${langs[i]}]` : undefined,
      codec: 'ac3',
      default: i === 0,
      external: false,
      forced: false,
      selected: i === 0,
    });
  }
  for (let i = 0; i < 8; i++) {
    tracks.push({
      id: 101 + i,
      type: 'sub',
      lang: langs[(i + 3) % langs.length],
      title: i % 3 === 0 ? 'Full subtitles' : undefined,
      codec: 'ass',
      default: false,
      external: i > 5,
      forced: i === 7,
      selected: i === 1,
    });
  }
  for (let i = 0; i < 4; i++) {
    tracks.push({ id: 201 + i, type: 'video', codec: 'h264', selected: i === 0 });
  }
  return tracks;
}

function makeChapters(count: number, step: number): MpvChapter[] {
  return Array.from({ length: count }, (_, i) => ({
    title: i % 12 === 0 ? 'Opening' : i % 12 === 11 ? 'Ending' : `Chapter ${i + 1}`,
    time: i * step,
  }));
}

test('tracks menu - labels and sort (per menu open)', async ({ bench }) => {
  const tracks = makeTracks();

  const b1 = bench('trackLabel x20 tracks x5k', () => {
    let checksum = 0;
    for (let i = 0; i < 5000; i++) {
      for (const track of tracks) checksum += trackLabel(track).length;
    }
    return checksum;
  });

  const b2 = bench('toTrackDisplay x20 tracks x5k', () => {
    let checksum = 0;
    for (let i = 0; i < 5000; i++) {
      for (const track of tracks) checksum += toTrackDisplay(track).main.length;
    }
    return checksum;
  });

  const b3 = bench('sortTracksByLanguage 20 tracks x2k', () => {
    let checksum = 0;
    for (let i = 0; i < 2000; i++) {
      checksum += sortTracksByLanguage(tracks).length;
    }
    return checksum;
  });

  await bench.compare(b1, b2, b3, { time: 100, iterations: 3 });
});

test('chapters and skip - per-position math', async ({ bench }) => {
  const chapters = makeChapters(48, 1400);
  const duration = 48 * 1400;

  const b1 = bench('findActiveChapter sweep x50k', () => {
    let checksum = 0;
    for (let i = 0; i < 50000; i++) {
      const active = findActiveChapter(chapters, (i * 37) % duration, duration);
      checksum += active ? active.index : -1;
    }
    return checksum;
  });

  const b2 = bench('skipLabel table x20k', () => {
    const titles = ['Opening', 'Ending', 'Intro', 'Preview', 'Intermission', 'Recap', 'Main Story', ''];
    let checksum = 0;
    for (let i = 0; i < 20000; i++) {
      for (const title of titles) checksum += skipLabel(title)?.length ?? 0;
    }
    return checksum;
  });

  await bench.compare(b1, b2, { time: 100, iterations: 3 });
});

test('language names - per track row', async ({ bench }) => {
  const b1 = bench('normalizeLangCode 12 codes x20k', () => {
    let checksum = 0;
    for (let i = 0; i < 20000; i++) {
      for (const code of LANGS) checksum += normalizeLangCode(code).length;
    }
    return checksum;
  });

  const b2 = bench('languageName Intl.DisplayNames x5k', () => {
    let checksum = 0;
    for (let i = 0; i < 5000; i++) {
      for (const code of LANGS) checksum += languageName(code).length;
    }
    return checksum;
  });

  await bench.compare(b1, b2, { time: 100, iterations: 3 });
});

test('render predicates and clocks - per render', async ({ bench }) => {
  const b1 = bench('loading predicates 16 combos x50k', () => {
    let checksum = 0;
    for (let i = 0; i < 50000; i++) {
      const bits = i % 16;
      const hasFile = (bits & 1) !== 0;
      const loadingFile = (bits & 2) !== 0;
      const failed = (bits & 4) !== 0;
      const hasShownFrame = (bits & 8) !== 0;
      checksum += shouldShowEmptyPlayer(hasFile, loadingFile, failed, hasShownFrame) ? 1 : 0;
      checksum += shouldShowLoadingSpinner(hasFile, loadingFile, failed, hasShownFrame) ? 1 : 0;
    }
    return checksum;
  });

  const b2 = bench('formatClock sweep x50k', () => {
    let checksum = 0;
    for (let i = 0; i < 50000; i++) {
      checksum += formatClock((i * 37) % 7200).length;
    }
    return checksum;
  });

  const b3 = bench('normalizePlayerPath x20k', () => {
    const sample = 'D:\\Anime\\Season 1\\\\Ep 12 [1080p].mkv';
    let checksum = 0;
    for (let i = 0; i < 20000; i++) {
      checksum += normalizePlayerPath(sample).length;
    }
    return checksum;
  });

  const b4 = bench('isPlayerPathHidden 50 rules x5k', () => {
    const hidden = Array.from({ length: 50 }, (_, i) => `D:/Anime/Hidden${i}/`);
    const sample = 'D:/Anime/Show/Season 1/Ep 12.mkv';
    let checksum = 0;
    for (let i = 0; i < 5000; i++) {
      checksum += isPlayerPathHidden(sample, hidden) ? 1 : 0;
    }
    return checksum;
  });

  await bench.compare(b1, b2, b3, b4, { time: 100, iterations: 3 });
});

test('card prefetch ordering', async ({ bench }) => {
  const small = Array.from({ length: 200 }, (_, i) => `/media/ep${i}.mkv`);
  const big = Array.from({ length: 2000 }, (_, i) => `/media/s${i >> 8}/ep${i}.mkv`);

  const b1 = bench('orderCardPaths 200 x2k', () => {
    let checksum = 0;
    for (let i = 0; i < 2000; i++) {
      checksum += orderCardPaths(small, small[i % small.length]).length;
    }
    return checksum;
  });

  const b2 = bench('orderCardPaths 2000 x200', () => {
    let checksum = 0;
    for (let i = 0; i < 200; i++) {
      checksum += orderCardPaths(big, big[(i * 37) % big.length]).length;
    }
    return checksum;
  });

  const b3 = bench('getCachedCard miss x50k', () => {
    let checksum = 0;
    for (let i = 0; i < 50000; i++) {
      checksum += getCachedCard(`/media/missing${i}.mkv`) === null ? 1 : 0;
    }
    return checksum;
  });

  await bench.compare(b1, b2, b3, { time: 100, iterations: 3 });
});
