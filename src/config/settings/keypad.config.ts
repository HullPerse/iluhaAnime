import type { GameKeypadKey } from "@/types/core/keypad";

/** Classic 4x4 hex keypad mapped to the main keyboard block. */
export const GAME_KEYPAD_ROWS: readonly (readonly GameKeypadKey[])[] = [
  [
    { key: 0x1, code: "Digit1", label: "1" },
    { key: 0x2, code: "Digit2", label: "2" },
    { key: 0x3, code: "Digit3", label: "3" },
    { key: 0xc, code: "Digit4", label: "C" },
  ],
  [
    { key: 0x4, code: "KeyQ", label: "4" },
    { key: 0x5, code: "KeyW", label: "5" },
    { key: 0x6, code: "KeyE", label: "6" },
    { key: 0xd, code: "KeyR", label: "D" },
  ],
  [
    { key: 0x7, code: "KeyA", label: "7" },
    { key: 0x8, code: "KeyS", label: "8" },
    { key: 0x9, code: "KeyD", label: "9" },
    { key: 0xe, code: "KeyF", label: "E" },
  ],
  [
    { key: 0xa, code: "KeyZ", label: "A" },
    { key: 0x0, code: "KeyX", label: "0" },
    { key: 0xb, code: "KeyC", label: "B" },
    { key: 0xf, code: "KeyV", label: "F" },
  ],
];

export const GAME_KEY_BY_CODE: ReadonlyMap<string, number> = new Map(
  GAME_KEYPAD_ROWS.flat().map((entry) => [entry.code, entry.key])
);
