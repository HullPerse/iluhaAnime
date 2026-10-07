import { test } from 'vitest';

import { formatParsedTitle, fileNameFromPath } from '@/lib/player/title.utils';
import { clearMediaParseCache, parseMediaPath } from '@/lib/media/parse.utils';
import fixtureRows from '../media/fixtures.json';

interface Fixture {
  id: string;
  dir: string;
  file: string;
}

const fixtures = fixtureRows as Fixture[];
const paths = fixtures.map((f) => `${f.dir}/${f.file}`);
const stubT = (key: string): string => key;

test('title parse - corpus cold vs warm (125 real filenames)', async ({ bench }) => {
  const b1 = bench('parseMediaPath corpus cold x125', () => {
    let checksum = 0;
    clearMediaParseCache();
    for (const path of paths) {
      checksum += parseMediaPath(path).title.length;
    }
    return checksum;
  });

  const b2 = bench('parseMediaPath corpus warm x125', () => {
    for (const path of paths) parseMediaPath(path);
    let checksum = 0;
    for (const path of paths) {
      checksum += parseMediaPath(path).title.length;
    }
    return checksum;
  });

  await bench.compare(b1, b2, { time: 100, iterations: 3 });
});

test('title display - per-row format cost (warm cache)', async ({ bench }) => {
  for (const path of paths) parseMediaPath(path);

  const b1 = bench('formatParsedTitle corpus warm x125', () => {
    let checksum = 0;
    for (const path of paths) {
      checksum += formatParsedTitle(path, stubT).length;
    }
    return checksum;
  });

  const b2 = bench('fileNameFromPath x50k', () => {
    const sample = paths[0];
    let checksum = 0;
    for (let i = 0; i < 50000; i++) {
      checksum += fileNameFromPath(sample).length;
    }
    return checksum;
  });

  const baselineFileName = (p: string): string => {
    const parts = p.replaceAll(/\\/g, "/").split("/");
    return parts.at(-1) || p;
  };

  const b3 = bench('fileNameFromPath baseline regex x50k', () => {
    const sample = paths[0];
    let checksum = 0;
    for (let i = 0; i < 50000; i++) {
      checksum += baselineFileName(sample).length;
    }
    return checksum;
  });

  await bench.compare(b1, b2, b3, { time: 100, iterations: 3 });
});
