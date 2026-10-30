import {
  KEYBIND_MANIFEST,
  type KeybindManifestEntry,
  type KeybindScope,
} from "@/config/manifest.config";
import { VIM_MOTION_KEYS } from "@/config/vim.config";

import { chordKey, parseChord } from "@/lib/chordHotkeys.utils";

export type KeybindOverride = string | null;

export interface ResolvedKeybind {
  entry: KeybindManifestEntry;
  activeChord: string | null;
  shadowedChord: string | null;
  shadowedBy: string | null;
  overridden: boolean;
}

const RESERVED_PREFIX_CODES: readonly string[] = [VIM_MOTION_KEYS.firstPrefix];

function isUsableChord(chord: string): boolean {
  const parsed = parseChord(chord);
  if (!parsed) return false;
  return !RESERVED_PREFIX_CODES.some((reserved) => {
    const wanted = parseChord(reserved);
    return wanted !== undefined && chordKey(wanted) === chordKey(parsed);
  });
}

function chordIdentity(scope: KeybindScope, chord: string): string | null {
  const parsed = parseChord(chord);
  return parsed ? `${scope}:${chordKey(parsed)}` : null;
}

export function resolveKeybinds(overrides: Record<string, KeybindOverride>): ResolvedKeybind[] {
  const rows: {
    entry: KeybindManifestEntry;
    defaultChord: string;
    finalChord: string | null;
    overridden: boolean;
  }[] = KEYBIND_MANIFEST.map((entry) => ({
    entry,
    defaultChord: entry.chord,
    finalChord: entry.chord,
    overridden: false,
  }));
  const byId = new Map(rows.map((row) => [row.entry.id, row]));

  for (const [id, override] of Object.entries(overrides)) {
    const row = byId.get(id);
    if (!row) continue;
    if (override === null) {
      row.finalChord = null;
      row.overridden = true;
      continue;
    }
    if (!isUsableChord(override)) continue;
    row.finalChord = override;
    row.overridden = true;
  }

  const winners = new Map<string, (typeof rows)[number]>();
  const shadowedBy = new Map<(typeof rows)[number], string>();
  const claim = (row: (typeof rows)[number], identity: string): void => {
    const previous = winners.get(identity);
    if (previous) shadowedBy.set(previous, row.entry.id);
    winners.set(identity, row);
  };
  for (const row of rows) {
    if (row.overridden || row.finalChord === null) continue;
    const identity = chordIdentity(row.entry.scope, row.finalChord);
    if (identity === null) continue;
    claim(row, identity);
  }
  for (const [id] of Object.entries(overrides)) {
    const row = byId.get(id);
    if (!row?.overridden || row.finalChord === null) continue;
    const identity = chordIdentity(row.entry.scope, row.finalChord);
    if (identity === null) continue;
    claim(row, identity);
  }
  const taken = new Set(winners.keys());

  return rows.map((row) => {
    const winner = shadowedBy.get(row);
    if (winner === undefined) {
      return {
        entry: row.entry,
        activeChord: row.finalChord,
        shadowedChord: null,
        shadowedBy: null,
        overridden: row.overridden,
      };
    }
    const defaultIdentity =
      row.defaultChord !== row.finalChord ? chordIdentity(row.entry.scope, row.defaultChord) : null;
    const fallback =
      defaultIdentity !== null && !taken.has(defaultIdentity) ? row.defaultChord : null;
    return {
      entry: row.entry,
      activeChord: fallback,
      shadowedChord: row.finalChord,
      shadowedBy: winner,
      overridden: row.overridden,
    };
  });
}

export function resolveScopeChords(
  scope: KeybindScope,
  overrides: Record<string, KeybindOverride>
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of resolveKeybinds(overrides)) {
    if (row.entry.scope !== scope || row.activeChord === null) continue;
    const parsed = parseChord(row.activeChord);
    if (parsed) map.set(chordKey(parsed), row.entry.id);
  }
  return map;
}
