import { bench, group } from "@pmndrs/labs";

import {
  diffFingerprintEntries,
  fingerprintEntries,
  type FingerprintEntry,
} from "../../src/lib/core/system/buildFingerprint.utils";

function makeEntries(count: number): FingerprintEntry[] {
  const entries: FingerprintEntry[] = [];
  for (let i = 0; i < count; i++) {
    entries.push({
      path: `src/routes/components/anilist/detail/section-${i}.tsx`,
      size: 1000 + (i % 4000),
      modifiedMs: 1_700_000_000_000 + (i % 10_000),
    });
  }
  return entries;
}

const ENTRIES_1K = makeEntries(1000);
const ENTRIES_5K = makeEntries(5000);
const ENTRIES_10K = makeEntries(10_000);

group("build-fingerprint @quick", () => {
  bench("fingerprint 1k files", () => fingerprintEntries(ENTRIES_1K));
  bench("fingerprint 5k files", () => fingerprintEntries(ENTRIES_5K));
  bench("fingerprint 10k files", () => fingerprintEntries(ENTRIES_10K));
  bench("diff 10k vs 5k", () => {
    const diff = diffFingerprintEntries(ENTRIES_10K, ENTRIES_5K);
    return diff.added.length + diff.changed.length + diff.removed.length;
  });
});
