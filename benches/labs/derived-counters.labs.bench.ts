import { bench, group } from '@pmndrs/labs';

import { calculateCollectionStats } from '../../src/lib/collection/stats.utils';
import { createSignalStore } from '../../src/lib/state/signal.store';
import type { CollectionItem } from '../../src/types/collection';

function mulberry32(seed: number): () => number {
  let state = Math.trunc(seed);
  return () => {
    state = Math.trunc(state + 0x6d2b79f5);
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t += Math.imul(t ^ (t >>> 7), 61 | t);
    t ^= t >>> 14;
    return (t >>> 0) / 4294967296;
  };
}

const WORDS = ['Frieren', 'Naruto', 'Titan', 'Slayer', 'Gate', 'Hunter', 'Bebop', 'Bleach'];
const STATUSES = ['planned', 'watching', 'completed', 'onhold', 'dropped', 'favorites'];

function makeItems(count: number, seed: number): CollectionItem[] {
  const rand = mulberry32(seed);
  const items: CollectionItem[] = [];
  for (let i = 0; i < count; i++) {
    items.push({
      id: `item-${i}`,
      title: `${WORDS[i % WORDS.length]} ${i}`,
      altTitles: [],
      type: 'anime',
      status: STATUSES[i % STATUSES.length] ?? 'planned',
      progressValue: Math.trunc(rand() * 24),
      progressTotal: 24,
      progressUnit: 'episodes',
      durationMinutes: 24,
      rating: rand() < 0.2 ? null : Math.trunc(rand() * 10) + 1,
      priority: 'normal',
      isFavorite: rand() < 0.05,
      year: 1990 + Math.trunc(rand() * 36),
      releaseDate: null,
      genres: ['action'],
      studio: null,
      description: null,
      notes: null,
      coverUrl: null,
      coverBlobId: null,
      thumbBlobId: null,
      externalIds: {},
      customFields: {},
      localPath: null,
      localKind: null,
      startedAt: null,
      finishedAt: null,
      lastWatchedAt: null,
      rewatchCount: 0,
      addedAt: i,
      updatedAt: i,
      sitesToView: [],
      tvCurrentSeason: null,
      tvCurrentEpisode: null,
      detailsJson: null,
    });
  }
  return items;
}

const ITEMS_A = makeItems(10000, 7);
const ITEMS_B = makeItems(10000, 8);

const store = createSignalStore();
const itemsCell = store.cell(ITEMS_A);
const statsDerived = store.derive([itemsCell], (args) => {
  return calculateCollectionStats(args[0] as CollectionItem[], []);
});

group('derived-counters @derived', () => {
  bench('manual stats x10k (recompute each read)', () => {
    let checksum = 0;
    for (let i = 0; i < 5; i++) {
      const s = calculateCollectionStats(i % 2 === 0 ? ITEMS_A : ITEMS_B, []);
      checksum += s.total + s.favoriteCount;
    }
    return checksum;
  });

  bench('derived write+read x10k (array swaps)', () => {
    let checksum = 0;
    for (let i = 0; i < 5; i++) {
      itemsCell.set(i % 2 === 0 ? ITEMS_A : ITEMS_B);
      const s = statsDerived.get();
      checksum += s.total + s.favoriteCount;
    }
    return checksum;
  });

  bench('derived cached reads x100 (no changes)', () => {
    itemsCell.set(ITEMS_A);
    let checksum = 0;
    for (let i = 0; i < 100; i++) {
      const s = statsDerived.get();
      checksum += s.total + s.favoriteCount;
    }
    return checksum;
  });
});
