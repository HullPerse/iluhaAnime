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
