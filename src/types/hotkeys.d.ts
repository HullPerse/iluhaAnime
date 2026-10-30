import type { HotkeyDef } from "@/types/chordHotkeys";

export interface UseHotkeysOptions<TId extends string = string> {
  ignore?: (event: KeyboardEvent) => boolean;
  capture?: boolean;
  enabled?: boolean;
  target?: React.RefObject<HTMLElement | null>;
  onAction: (id: TId, event: KeyboardEvent) => void;
}

export interface ResolvedHotkeyDef<TId extends string = string> extends HotkeyDef<TId> {
  keybindId: string;
}
