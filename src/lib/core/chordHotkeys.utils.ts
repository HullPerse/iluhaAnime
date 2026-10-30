import type { HotkeyChord } from "@/types/core/chordHotkeys";

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

const KEY_LABELS: Record<string, string> = {
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  BracketLeft: "[",
  BracketRight: "]",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  Backslash: "\\",
  Numpad0: "Num 0",
  Numpad1: "Num 1",
  Numpad2: "Num 2",
  Numpad3: "Num 3",
  Numpad4: "Num 4",
  Numpad5: "Num 5",
  Numpad6: "Num 6",
  Numpad7: "Num 7",
  Numpad8: "Num 8",
  Numpad9: "Num 9",
  NumpadAdd: "Num +",
  NumpadSubtract: "Num -",
  NumpadMultiply: "Num *",
  NumpadDivide: "Num /",
  NumpadDecimal: "Num .",
  NumpadEnter: "Num Enter",
};

function humanizeCode(code: string): string {
  if (code.startsWith("Key") && code.length === 4) return code.slice(3);
  if (code.startsWith("Digit") && code.length === 6) return code.slice(5);
  return KEY_LABELS[code] ?? code;
}

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

export function humanizeChord(input: string): string {
  return splitChordParts(input)?.join("+") ?? input;
}

export function chordIdentity(chord: string): string | null {
  const parsed = parseChord(chord);
  return parsed ? chordKey(parsed) : null;
}
