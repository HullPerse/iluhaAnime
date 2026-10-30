export interface GameKeypadKey {
  /** CHIP-8 keypad index (0x0-0xF). */
  key: number;
  /** Physical `KeyboardEvent.code` that presses it. */
  code: string;
  /** Single-character label of the original hex keypad. */
  label: string;
}
