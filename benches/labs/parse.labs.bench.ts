import { bench, group } from '@pmndrs/labs';

import { clearMediaParseCache, parseMediaPath } from '../../src/lib/media/parse.utils';
import fixtureRows from '../../src/tests/lib/media/fixtures.json';

interface Fixture {
  id: string;
  dir: string;
  file: string;
}

const PATHS = (fixtureRows as Fixture[]).map((f) => `${f.dir}/${f.file}`);

group('parse @pilot @media', () => {
  bench('corpus cold x125 (cache cleared)', () => {
    clearMediaParseCache();
    let checksum = 0;
    for (const path of PATHS) {
      checksum += parseMediaPath(path).title.length;
    }
    return checksum;
  });

  bench('corpus warm x125 (cache hits)', () => {
    let checksum = 0;
    for (const path of PATHS) {
      checksum += parseMediaPath(path).title.length;
    }
    return checksum;
  });
});
