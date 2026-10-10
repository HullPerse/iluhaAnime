import { bench, group } from '@pmndrs/labs';

import { getSearchSuggestions } from '../../src/lib/search/suggestions.utils';
import type { SearchAnimeSuggestion, SearchQueryStat } from '../../src/types/search';

const WORDS = [
  'Frieren', 'Naruto', 'Titan', 'Slayer', 'Gate', 'Hunter', 'Bebop', 'Bleach',
  'Evangelion', 'Gintama', 'Clannad', 'Toradora', 'ReZero', 'Steins', 'Alchemist',
];

function makeIndex(count: number): SearchAnimeSuggestion[] {
  const out: SearchAnimeSuggestion[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      id: i,
      title: `${WORDS[i % WORDS.length]} ${WORDS[(i * 7) % WORDS.length]} ${i}`,
      aliases: [`alias ${i} ${WORDS[(i * 3) % WORDS.length]}`],
      favourite: i % 50 === 0,
      score: (i % 10) + 1,
      status: 'FINISHED',
      season: null,
      seasonYear: 2000 + (i % 26),
    });
  }
  return out;
}

function makeStats(count: number): Record<string, SearchQueryStat> {
  const stats: Record<string, SearchQueryStat> = {};
  for (let i = 0; i < count; i += 4) {
    stats[`frieren ${i}`] = { count: 2, lastUsedAt: Date.now(), selectedCount: 1 };
  }
  return stats;
}

const INDEX = makeIndex(5000);
const STATS = makeStats(5000);
const HISTORY = ['naruto shippuden', 'one piece', 'attack on titan'];
const QUERIES = ['friren', 'naruto ship', 'attack', 'one', 'steins'];

group('suggest-pipeline @search @quick', () => {
  bench('suggest x5k steady state (per keystroke)', () => {
    let checksum = 0;
    for (const q of QUERIES) {
      const out = getSearchSuggestions(q, {
        animeIndex: INDEX,
        history: HISTORY,
        queryStats: STATS,
        limit: 8,
      });
      checksum += out.length + out.map((s) => s.value.length).reduce((a, b) => a + b, 0);
    }
    return checksum;
  });
});
