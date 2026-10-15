import { humanizeChord } from "./chord.hotkeys";
import { resolveKeybinds, type KeybindOverride } from "./resolve.hotkeys";

/**
 * Tooltip text for a control that fires a keybind: `[P]: Pause`.
 * Bare title when the entry is unbound or unknown, so a removed binding
 * never renders a dangling bracket.
 */
export function formatKeybindTitle(title: string, activeChord: string | null | undefined): string {
  if (!title || !activeChord) return title;
  const human = humanizeChord(activeChord);
  if (!human) return title;
  return `[${human}]: ${title}`;
}

/** Live chord for one manifest entry, or null when unbound or unknown. */
export function activeChordForKeybind(
  overrides: Record<string, KeybindOverride>,
  keybindId: string
): string | null {
  const row = resolveKeybinds(overrides).find((entry) => entry.entry.id === keybindId);
  return row?.activeChord ?? null;
}
