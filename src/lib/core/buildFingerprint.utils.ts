/**
 * Deterministic fingerprints for the incremental build pipeline.
 *
 * A stage is skipped only when every input file keeps the same path, size and
 * modification time. The hash is a 64-bit FNV-1a pair (32 bits for the path
 * stream, 32 bits for the size/mtime stream) so the check stays cheap enough
 * that skipping a stage always costs less than running it.
 */

export interface FingerprintEntry {
  path: string;
  size: number;
  modifiedMs: number;
}

export interface FingerprintDiff {
  added: string[];
  changed: string[];
  removed: string[];
}

const FNV_OFFSET = 0x81_1c_9d_c5;
const FNV_PRIME = 0x01_00_01_93;

function mixByte(hash: number, byte: number): number {
  return Math.imul(hash ^ (byte & 0xff), FNV_PRIME) >>> 0;
}

function mixNumber(hash: number, value: number): number {
  let next = hash;
  for (let shift = 0; shift < 32; shift += 8) {
    next = mixByte(next, value >>> shift);
  }
  return next;
}

function hex8(value: number): string {
  return value.toString(16).padStart(8, "0");
}

/**
 * Hashes a file list. Order does not matter: entries are sorted by path first,
 * so directory traversal order cannot change the result.
 */
export function fingerprintEntries(entries: readonly FingerprintEntry[]): string {
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  let paths = FNV_OFFSET;
  let stats = FNV_OFFSET;
  for (const entry of sorted) {
    for (const character of entry.path) {
      const code = character.codePointAt(0) ?? 0;
      paths = mixByte(paths, code & 0xff);
      paths = mixByte(paths, code >>> 8);
    }
    paths = mixByte(paths, 0);
    stats = mixNumber(stats, entry.size);
    stats = mixNumber(stats, Math.round(entry.modifiedMs));
  }
  return `${hex8(paths)}${hex8(stats)}${sorted.length.toString(16)}`;
}

/** Reports what changed between two snapshots, so a skip can name its reason. */
export function diffFingerprintEntries(
  previous: readonly FingerprintEntry[],
  next: readonly FingerprintEntry[]
): FingerprintDiff {
  const before = new Map(previous.map((entry) => [entry.path, entry]));
  const added: string[] = [];
  const changed: string[] = [];
  for (const entry of next) {
    const old = before.get(entry.path);
    if (!old) {
      added.push(entry.path);
      continue;
    }
    if (old.size !== entry.size || Math.round(old.modifiedMs) !== Math.round(entry.modifiedMs)) {
      changed.push(entry.path);
    }
    before.delete(entry.path);
  }
  return { added, changed, removed: [...before.keys()] };
}

export function isFingerprintCurrent(
  stored: { fingerprint: string } | null | undefined,
  entries: readonly FingerprintEntry[]
): boolean {
  return (
    stored !== null && stored !== undefined && stored.fingerprint === fingerprintEntries(entries)
  );
}
