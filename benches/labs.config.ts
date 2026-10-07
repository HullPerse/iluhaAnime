import { defineConfig } from '@pmndrs/labs';

export default defineConfig({
  benchDir: 'labs',
  benchMatch: '**/*.labs.bench.ts',
  blocks: 8,
  resultsDir: '.labs',
  alpha: 0.05,
  minDelta: 0.05,
  snapshotTolerance: 1e-9,
});
