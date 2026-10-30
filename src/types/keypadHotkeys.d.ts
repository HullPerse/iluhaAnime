export interface KeypadOptions {
  /** Physical `KeyboardEvent.code` to emulator key index. */
  keys: ReadonlyMap<string, number>;
  onKey: (key: number, pressed: boolean) => void;
}
