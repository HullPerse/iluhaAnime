import { describe, expect, it } from "vitest";

import {
  diffFingerprintEntries,
  fingerprintEntries,
  isFingerprintCurrent,
  type FingerprintEntry,
} from "@/lib/core/buildFingerprint.utils";

const entry = (path: string, size = 10, modifiedMs = 1000): FingerprintEntry => {
  return { path, size, modifiedMs };
};

describe("utils/buildFingerprint", () => {
  it("hashes the same tree to the same value regardless of order", () => {
    const forward = [entry("src/a.ts"), entry("src/b.ts"), entry("src/c.ts")];
    const backward = forward.toReversed();

    expect(fingerprintEntries(forward)).toBe(fingerprintEntries(backward));
  });

  it("changes when a file grows or is touched", () => {
    const base = [entry("src/a.ts"), entry("src/b.ts")];

    expect(fingerprintEntries([entry("src/a.ts", 11), entry("src/b.ts")])).not.toBe(
      fingerprintEntries(base)
    );
    expect(fingerprintEntries([entry("src/a.ts", 10, 2000), entry("src/b.ts")])).not.toBe(
      fingerprintEntries(base)
    );
  });

  it("distinguishes an added file from a removed one", () => {
    const single = [entry("src/a.ts")];

    expect(fingerprintEntries(single)).not.toBe(
      fingerprintEntries([entry("src/a.ts"), entry("src/b.ts")])
    );
    expect(fingerprintEntries([])).not.toBe(fingerprintEntries(single));
  });

  it("keeps path boundaries from collapsing into one file", () => {
    expect(fingerprintEntries([entry("ab")])).not.toBe(
      fingerprintEntries([entry("a"), entry("b")])
    );
  });

  it("names what changed between two snapshots", () => {
    const before = [entry("keep.ts"), entry("edit.ts", 10), entry("gone.ts")];
    const after = [entry("keep.ts"), entry("edit.ts", 20), entry("new.ts")];

    expect(diffFingerprintEntries(before, after)).toEqual({
      added: ["new.ts"],
      changed: ["edit.ts"],
      removed: ["gone.ts"],
    });
  });

  it("treats an absent stored snapshot as stale", () => {
    const entries = [entry("src/a.ts")];

    expect(isFingerprintCurrent(null, entries)).toBe(false);
    expect(isFingerprintCurrent({ fingerprint: "other" }, entries)).toBe(false);
    expect(isFingerprintCurrent({ fingerprint: fingerprintEntries(entries) }, entries)).toBe(true);
  });
});
