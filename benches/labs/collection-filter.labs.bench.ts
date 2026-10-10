import { bench, group } from '@pmndrs/labs';

import { DEFAULT_FILTERS } from '../../src/config/collection/filters.config';
import { applyShortQueryFilter, filterCollectionItems } from '../../src/lib/collection/filter.utils';
import {
  matchOperatorTerm,
  matchOperatorTerms,
  parseOperatorTerms,
} from '../../src/lib/search/score.utils';
import { normalizeSearchText } from '../../src/lib/search/normalize.utils';
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

const TITLE_WORDS = [
  'Frieren',
  'Naruto',
  'One Piece',
  'Attack',
  'Titan',
  'Demon',
  'Slayer',
  'Steins',
  'Gate',
  'Hunter',
  'Fullmetal',
  'Alchemist',
  'Cowboy',
  'Bebop',
  'Evangelion',
  'Bleach',
  'Gintama',
  'Clannad',
  'Toradora',
  'ReZero',
];

const STATUSES = ['planned', 'watching', 'completed', 'onhold', 'dropped', 'favorites'];
const GENRES = ['action', 'drama', 'fantasy', 'sci-fi', 'romance', 'comedy', 'horror'];

function makeItems(count: number, seed: number): CollectionItem[] {
  const rand = mulberry32(seed);
  const items: CollectionItem[] = [];
  for (let i = 0; i < count; i++) {
    const w1 = TITLE_WORDS[Math.trunc(rand() * TITLE_WORDS.length)] ?? 'Anime';
    const w2 = TITLE_WORDS[Math.trunc(rand() * TITLE_WORDS.length)] ?? 'Title';
    items.push({
      id: `item-${i}`,
      title: `${w1} ${w2} ${i}`,
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
      genres: [GENRES[Math.trunc(rand() * GENRES.length)] ?? 'action'],
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

const ITEMS_1K = makeItems(1000, 42);
const ITEMS_10K = makeItems(10000, 42);

function checksumOf(list: CollectionItem[]): number {
  let sum = list.length;
  for (const item of list) sum += item.title.length + item.updatedAt;
  return sum;
}

function matchesShortQueryLegacy(item: CollectionItem, query: string): boolean {
  return (
    item.title.toLowerCase().includes(query) ||
    item.altTitles.some((alt) => alt.toLowerCase().includes(query)) ||
    item.genres.some((genre) => genre.toLowerCase().includes(query)) ||
    Boolean(item.studio?.toLowerCase().includes(query))
  );
}

function shortQueryLegacy(list: CollectionItem[], query: string): CollectionItem[] {
  return list.filter((item) => {
    const terms = parseOperatorTerms(query);
    if (!terms) return matchesShortQueryLegacy(item, query.toLowerCase());
    const fields = [item.title, ...item.altTitles, ...item.genres, item.studio ?? ""]
      .map(normalizeSearchText)
      .filter((field) => field.length > 0);
    if (terms.every((term) => term.negate)) {
      return !fields.some((field) =>
        terms.some((term) => matchOperatorTerm({ ...term, negate: false }, field) != null)
      );
    }
    return fields.some((field) => matchOperatorTerms(terms, field) != null);
  });
}

group('collection-filter @pilot @collection @quick', () => {
  bench('1k empty query + date sort', () => {
    return checksumOf(
      filterCollectionItems(ITEMS_1K, ITEMS_1K, 'all', '', DEFAULT_FILTERS, 'date', 'desc')
    );
  });

  bench('10k empty query + date sort', () => {
    return checksumOf(
      filterCollectionItems(ITEMS_10K, ITEMS_10K, 'all', '', DEFAULT_FILTERS, 'date', 'desc')
    );
  });

  bench('10k text query frieren + name sort', () => {
    return checksumOf(
      filterCollectionItems(ITEMS_10K, ITEMS_10K, 'all', 'frieren', DEFAULT_FILTERS, 'name', 'asc')
    );
  });

  bench('10k intent query year:2020 + rating sort', () => {
    return checksumOf(
      filterCollectionItems(
        ITEMS_10K,
        ITEMS_10K,
        'all',
        'year:2020',
        DEFAULT_FILTERS,
        'rating',
        'desc'
      )
    );
  });

  bench('10k short query fr LEGACY (parse per item)', () => {
    return checksumOf(shortQueryLegacy(ITEMS_10K, 'fr'));
  });

  bench('10k short query fr NEW (hoisted + cached)', () => {
    return checksumOf(applyShortQueryFilter(ITEMS_10K, 'fr'));
  });

  bench('10k operator query ^fr LEGACY (parse per item)', () => {
    return checksumOf(shortQueryLegacy(ITEMS_10K, '^fr'));
  });

  bench('10k operator query ^fr NEW (hoisted + cached)', () => {
    return checksumOf(applyShortQueryFilter(ITEMS_10K, '^fr'));
  });
});
