import { bench, group } from "@pmndrs/labs";
// Cost of the incremental-build gate itself. The stage wrapper is only worth it
// while fingerprinting a full tree stays far below the stage it can skip: the
// frontend stage is seconds, the release Rust stage is minutes.
// Budget (avg/iter, this machine, 2026-11-01): 1k 395us, 5k 2.0ms, 10k 4.1ms,
// diff 10k vs 5k 660us. The repo is ~1.8k tracked build inputs, so one gate
// pass is ~1ms against a 33s `cargo check` and a multi-minute release build.
// Regression threshold is the labs minDelta 5%.

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
