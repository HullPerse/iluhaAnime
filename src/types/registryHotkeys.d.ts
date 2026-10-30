import type { HotkeyDef } from "@/types/chordHotkeys";

export interface ResolvedHotkey<TId extends string = string> {
  id: TId;
  repeat: HotkeyDef<TId>["repeat"];
}

export interface HotkeysHandlerOptions<TId extends string = string> {
  registry: Map<string, ResolvedHotkey<TId>>;
  ignore?: (event: KeyboardEvent) => boolean;
  onAction: (id: TId, event: KeyboardEvent) => void;
}

export interface SubscribeHotkeysOptions<TId extends string = string> extends Omit<
  HotkeysHandlerOptions<TId>,
  "registry"
> {
  defs: readonly HotkeyDef<TId>[];
  capture?: boolean;
}
