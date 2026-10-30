import { humanizeChord } from "@/lib/core/chordHotkeys.utils";
import { resolveKeybinds } from "@/lib/search/resolveHotkeys.utils";
import type { KeybindOverride } from "@/types/search/resolveHotkeys";

export function formatKeybindTitle(title: string, activeChord: string | null | undefined): string {
  if (!title || !activeChord) return title;
  const human = humanizeChord(activeChord);
  if (!human) return title;
  return `[${human}]: ${title}`;
}

export function activeChordForKeybind(
  overrides: Record<string, KeybindOverride>,
  keybindId: string
): string | null {
  const row = resolveKeybinds(overrides).find((entry) => entry.entry.id === keybindId);
  return row?.activeChord ?? null;
}
