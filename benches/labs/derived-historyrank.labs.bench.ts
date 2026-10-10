import { bench, group } from '@pmndrs/labs';

import { rankHistoryEntries } from '../../src/lib/search/suggestions.utils';
import { createSignalStore } from '../../src/lib/state/signal.store';
import type { SearchQueryStat } from '../../src/types/search';

function makeHistory(count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(`anime title number ${i}`);
  return out;
}

function makeStats(count: number, base: number): Record<string, SearchQueryStat> {
  const stats: Record<string, SearchQueryStat> = {};
  for (let i = 0; i < count; i += 2) {
    stats[`anime title number ${i}`] = {
      count: (i % 5) + base,
      lastUsedAt: Date.now() - i * 1000,
      selectedCount: i % 3,
      ignoredCount: 0,
    };
  }
  return stats;
}

const HISTORY = makeHistory(500);
const STATS_A = makeStats(500, 1);
const STATS_B = makeStats(500, 2);

const store = createSignalStore();
const historyCell = store.cell(HISTORY);
const statsCell = store.cell<Record<string, SearchQueryStat>>(STATS_A);
const rankedDerived = store.derive([historyCell, statsCell], (args) => {
  const [history, stats] = args as [string[], Record<string, SearchQueryStat>];
  return rankHistoryEntries(history, stats, 8);
});

group('derived-historyrank @derived @quick', () => {
  bench('manual rank x500 (recompute each read)', () => {
    let checksum = 0;
    for (let i = 0; i < 10; i++) {
      const ranked = rankHistoryEntries(HISTORY, i % 2 === 0 ? STATS_A : STATS_B, 8);
      checksum += ranked.length + ranked.join('').length;
    }
    return checksum;
  });

  bench('derived write+read x500 (stats swap)', () => {
    let checksum = 0;
    for (let i = 0; i < 10; i++) {
      statsCell.set(i % 2 === 0 ? STATS_A : STATS_B);
      const ranked = rankedDerived.get();
      checksum += ranked.length + ranked.join('').length;
    }
    return checksum;
  });

  bench('derived cached reads x100 (no changes)', () => {
    statsCell.set(STATS_A);
    let checksum = 0;
    for (let i = 0; i < 100; i++) {
      const ranked = rankedDerived.get();
      checksum += ranked.length + ranked.join('').length;
    }
    return checksum;
  });
});
