export interface KeypadOptions {
  keys: ReadonlyMap<string, number>;
  onKey: (key: number, pressed: boolean) => void;
}
