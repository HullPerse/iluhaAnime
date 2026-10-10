import { bench, group } from '@pmndrs/labs';

// Decomposition bench for F-R1: where do the 28-34ms per keystroke go.
// Budget: decomposition only, no pass/fail threshold; the numbers decide
// whether the suggest pipeline needs surgery. Each bench returns a checksum
// so labs can detect dead code elimination. Fixtures are deterministic
// (modulo arithmetic, no RNG), copied from suggest-pipeline.labs.bench.ts.

import { normalizeSearchText } from '../../src/lib/search/normalize.utils';
import { parseOperatorTerms } from '../../src/lib/search/score.utils';
import {
  getSearchSuggestions,
  matchNormalizedTitle,
  suggestSpelling,
} from '../../src/lib/search/suggestions.utils';
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
const OPERATOR_QUERIES = ['^friren', 'naruto !piece', "'attack", 'steins$'];

// Pre-normalized once, outside the measured closure: this isolates the
// per-pair scoring cost from the WeakMap cache behaviour.
const NORM_TITLES: string[][] = INDEX.map((anime) =>
  [anime.title, ...anime.aliases].map(normalizeSearchText),
);

group('suggest-decomp @search @slow', () => {
  bench('query side x5 (normalize + operators, once per keystroke)', () => {
    let checksum = 0;
    for (const q of QUERIES) {
      const nq = normalizeSearchText(q);
      const terms = parseOperatorTerms(q);
      checksum += nq.length + (terms ? terms.length : 0);
    }
    return checksum;
  });

  bench('anime loop x5k plain (words hoisted, no stats)', () => {
    let checksum = 0;
    for (const q of QUERIES) {
      const nq = normalizeSearchText(q);
      const terms = parseOperatorTerms(q);
      const qw = terms ? [] : nq.split(' ');
      for (const titles of NORM_TITLES) {
        for (const t of titles) {
          checksum += matchNormalizedTitle(terms, nq, t, qw) ?? 0;
        }
      }
    }
    return checksum;
  });

  bench('anime loop x5k operators (matchOperatorTerms path)', () => {
    let checksum = 0;
    for (const q of OPERATOR_QUERIES) {
      const nq = normalizeSearchText(q);
      const terms = parseOperatorTerms(q);
      const qw = terms ? [] : nq.split(' ');
      for (const titles of NORM_TITLES) {
        for (const t of titles) {
          checksum += matchNormalizedTitle(terms, nq, t, qw) ?? 0;
        }
      }
    }
    return checksum;
  });

  bench('symspell fallback x5 alone (suggestSpelling)', () => {
    let checksum = 0;
    for (const q of QUERIES) {
      const out = suggestSpelling(q, { history: HISTORY, animeIndex: INDEX });
      checksum += out?.length ?? 0;
    }
    return checksum;
  });

  bench('full getSearchSuggestions x5 (control)', () => {
    let checksum = 0;
    for (const q of QUERIES) {
      const out = getSearchSuggestions(q, {
        animeIndex: INDEX,
        history: HISTORY,
        queryStats: STATS,
        limit: 8,
      });
      checksum += out.length + out.reduce((a, s) => a + s.score, 0);
    }
    return checksum;
  });
});
