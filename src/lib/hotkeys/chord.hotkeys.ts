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

const ARROW_GLYPHS: Record<string, string> = {
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
};

function humanizeCode(code: string): string {
  if (code.startsWith("Key") && code.length === 4) return code.slice(3);
  if (code.startsWith("Digit") && code.length === 6) return code.slice(5);
  return ARROW_GLYPHS[code] ?? code;
}

/**
 * Splits a chord into display parts: modifiers first, then the key, e.g.
 * `ctrl+KeyK` becomes `["Ctrl", "K"]`. Returns null for unparseable input so
 * callers can fall back to the raw string.
 */
export function splitChordParts(input: string): string[] | null {
  const chord = parseChord(input);
  if (!chord) return null;
  const parts: string[] = [];
  if (chord.ctrl) parts.push("Ctrl");
  if (chord.alt) parts.push("Alt");
  if (chord.shift) parts.push("Shift");
  if (chord.meta) parts.push("Meta");
  parts.push(humanizeCode(chord.code));
  return parts;
}

/**
 * Renders a chord the way the keybinds tab shows it: `ctrl+KeyK` becomes
 * `Ctrl+K`, `ArrowLeft` becomes a glyph. Unparseable input passes through
 * untouched so the tab never blanks a row it cannot read.
 */
export function humanizeChord(input: string): string {
  return splitChordParts(input)?.join("+") ?? input;
}
