import type { KeyboardEvent } from "react";

import type { LiveModifiers } from "@/types/ui/keyboardChord";

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta"]);

export function chordFromKeyboardEvent(event: KeyboardEvent, live: LiveModifiers): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null;
  const parts: string[] = [];
  if (event.ctrlKey || live.ctrl) parts.push("ctrl");
  if (event.altKey || live.alt) parts.push("alt");
  if (event.shiftKey || live.shift) parts.push("shift");
  if (event.metaKey || live.meta) parts.push("meta");
  parts.push(event.code);
  return parts.join("+");
}
