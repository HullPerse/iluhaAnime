import {
  chordKey,
  chordKeyFromEvent,
  parseChord,
  type HotkeyDef,
} from "./chord.hotkeys";

export interface ResolvedHotkey<TId extends string = string> {
  id: TId;
  repeat: HotkeyDef<TId>["repeat"];
}

export function createHotkeyRegistry<TId extends string>(
  defs: readonly HotkeyDef<TId>[]
): Map<string, ResolvedHotkey<TId>> {
  const registry = new Map<string, ResolvedHotkey<TId>>();
  for (const def of defs) {
    const chord = parseChord(def.chord);
    if (!chord) {
      console.warn(`hotkeys: invalid chord "${def.chord}" for "${def.id}", skipped`);
      continue;
    }
    const key = chordKey(chord);
    const clash = registry.get(key);
    if (clash) {
      console.warn(`hotkeys: chord "${def.chord}" of "${def.id}" clashes with "${clash.id}", skipped`);
      continue;
    }
    registry.set(key, { id: def.id, repeat: def.repeat });
  }
  return registry;
}

export interface HotkeysHandlerOptions<TId extends string = string> {
  registry: Map<string, ResolvedHotkey<TId>>;
  ignore?: (event: KeyboardEvent) => boolean;
  onAction: (id: TId, event: KeyboardEvent) => void;
}

export function createHotkeysHandler<TId extends string>(
  options: HotkeysHandlerOptions<TId>
): (event: KeyboardEvent) => void {
  const { registry, ignore, onAction } = options;
  return (event) => {
    if (event.isComposing || ignore?.(event)) return;
    const hit = registry.get(chordKeyFromEvent(event));
    if (!hit) return;
    if (event.repeat && hit.repeat === "once") return;
    event.preventDefault();
    onAction(hit.id, event);
  };
}

export interface SubscribeHotkeysOptions<TId extends string = string>
  extends Omit<HotkeysHandlerOptions<TId>, "registry"> {
  defs: readonly HotkeyDef<TId>[];
  capture?: boolean;
}

export function subscribeHotkeys<TId extends string>(
  target: Window | HTMLElement,
  options: SubscribeHotkeysOptions<TId>
): () => void {
  const handler = createHotkeysHandler({
    registry: createHotkeyRegistry(options.defs),
    ignore: options.ignore,
    onAction: options.onAction,
  });
  const capture = options.capture ?? false;
  const listener = (event: Event) => {
    if (event instanceof KeyboardEvent) handler(event);
  };
  target.addEventListener("keydown", listener, capture);
  return () => target.removeEventListener("keydown", listener, capture);
}
