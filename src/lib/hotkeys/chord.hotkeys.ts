export interface HotkeyChord {
  code: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

export type HotkeyRepeat = "once" | "hold";

export interface HotkeyDef<TId extends string = string> {
  id: TId;
  chord: string;
  repeat: HotkeyRepeat;
}

const CODE_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;

const MODIFIERS: Record<string, "ctrl" | "shift" | "alt" | "meta"> = {
  ctrl: "ctrl",
  control: "ctrl",
  shift: "shift",
  alt: "alt",
  meta: "meta",
};

export function parseChord(input: string): HotkeyChord | undefined {
  const parts = input
    .split("+")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const code = parts.pop();
  if (!code || !CODE_PATTERN.test(code) || MODIFIERS[code.toLowerCase()]) return undefined;
  const chord: HotkeyChord = { code, ctrl: false, shift: false, alt: false, meta: false };
  for (const part of parts) {
    const field = MODIFIERS[part.toLowerCase()];
    if (!field) return undefined;
    chord[field] = true;
  }
  return chord;
}

export function chordKey(chord: HotkeyChord): string {
  return `${chord.code}:${chord.ctrl}:${chord.shift}:${chord.alt}:${chord.meta}`;
}

export function chordKeyFromEvent(event: KeyboardEvent): string {
  return `${event.code}:${event.ctrlKey}:${event.shiftKey}:${event.altKey}:${event.metaKey}`;
}
