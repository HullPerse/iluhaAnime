import {
  KEYBIND_MANIFEST,
  type KeybindManifestEntry,
  type KeybindScope,
} from "@/config/keyboard/manifest.config";
import { VIM_MOTION_KEYS } from "@/config/keyboard/vim.config";

import { chordKey, parseChord } from "./chord.hotkeys";

/** A user override: a replacement chord, or null to unbind the entry. */
export type KeybindOverride = string | null;

export interface ResolvedKeybind {
  entry: KeybindManifestEntry;
  /** The chord that actually fires, or null when unbound. */
  activeChord: string | null;
  /** The contested chord to show muted when shadowed, else null. */
  shadowedChord: string | null;
  /** The entry id that took the chord, when shadowed. */
  shadowedBy: string | null;
  overridden: boolean;
}

/**
 * Single-stroke sequence prefixes are reserved: binding a bare prefix stroke
 * would trap it in the prefix state forever (the engine has no timers), so
 * such overrides are dropped with the default kept. `gg` itself is not in
 * the manifest and can never be overridden.
 */
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

/**
 * Applies user overrides onto the manifest. Order is manifest order, then
 * overrides in object order: for one scope+chord the later row wins and the
 * loser falls back to its own default when that default is different and
 * still free, otherwise it goes unbound. Unknown entry ids, unparsable
 * chords and reserved prefix strokes drop the override and keep the default.
 * The returned active chords are collision-free per scope, so registries can
 * be built straight from them.
 */
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
  // Phase 1: defaults establish the base in manifest order. Phase 2: user
  // overrides apply in object order on top, so an override always beats a
  // default and recency decides between overrides.
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
    // The loser's own default stays live when it differs from the contested
    // chord and nothing took it; manifest defaults are unique per scope, so
    // two losers can never fall back onto each other.
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

/**
 * Collision-free chord map for one scope, ready for registry building:
 * chord key to the entry id that owns it. Unbound and shadowed rows are out.
 */
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
