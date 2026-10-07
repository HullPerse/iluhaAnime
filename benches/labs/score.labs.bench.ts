import { bench, group } from '@pmndrs/labs';

import { fuzzyMatchScore, fuzzyMatchScorePreNormalized } from '../../src/lib/search/score.utils';
import { normalizeSearchText } from '../../src/lib/search/normalize.utils';

const QUERIES = [
  'naruto shippuden',
  'one piece',
  'steins gate 0',
  'attack on titan final season',
  'demon slayer',
  'fullmetal alchemist brotherhood',
  'hunter x hunter 2011',
  'fma',
  'snk s4',
  'cowboy bebop movie',
];

const CANDIDATES = [
  'Naruto Shippuden',
  'Naruto',
  'One Piece',
  'One Piece Film Red',
  'Steins;Gate 0',
  'Attack on Titan',
  'Attack on Titan: Final Season',
  'Shingeki no Kyojin',
  'Demon Slayer: Kimetsu no Yaiba',
  'Fullmetal Alchemist: Brotherhood',
  'Hunter x Hunter (2011)',
  'Fullmetal Alchemist',
  'Attack on Titan Season 4',
  'Steins Gate',
  'Cowboy Bebop: The Movie',
  'One Piece Stampede',
  'Demon Slayer Entertainment District',
  'Shinsekai yori',
  'Shingeki no Kyojin Season 3 Part 2',
  'Fate Zero',
];

const NORM_CANDIDATES = CANDIDATES.map(normalizeSearchText);

group('score @pilot @search', () => {
  bench('query-aware x200 (normalize + parse per call)', () => {
    let checksum = 0;
    for (const q of QUERIES) {
      for (const c of CANDIDATES) {
        checksum += fuzzyMatchScore(q, c) ?? 0;
      }
    }
    return checksum;
  });

  bench('pre-normalized x200 (norm once per side)', () => {
    let checksum = 0;
    for (const q of QUERIES) {
      const nq = normalizeSearchText(q);
      for (const nc of NORM_CANDIDATES) {
        checksum += fuzzyMatchScorePreNormalized(nq, nc) ?? 0;
      }
    }
    return checksum;
  });

  bench('pre-normalized SLOWED x200 (added 2-gram loop)', () => {
    let checksum = 0;
    for (const q of QUERIES) {
      const nq = normalizeSearchText(q);
      for (const nc of NORM_CANDIDATES) {
        checksum += fuzzyMatchScorePreNormalized(nq, nc) ?? 0;
        // deliberate O(len²) work per pair to simulate a bad rewrite
        for (let a = 0; a < nq.length; a++) {
          for (let b = a + 1; b <= nq.length; b++) {
            checksum ^= Math.trunc(a * 31 + b * 17 + nc.length);
          }
        }
      }
    }
    return checksum;
  });
});
