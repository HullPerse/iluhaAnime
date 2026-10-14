import { useEffect, useMemo, useRef } from "react";

import type { HotkeyDef } from "@/lib/hotkeys/chord.hotkeys";
import { subscribeHotkeys } from "@/lib/hotkeys/registry.hotkeys";
import { resolveKeybinds } from "@/lib/hotkeys/resolve.hotkeys";
import { useCell } from "@/lib/state/signal.hook";
import { settingsAtoms } from "@/store/settings.store";

export interface UseHotkeysOptions<TId extends string = string> {
  ignore?: (event: KeyboardEvent) => boolean;
  capture?: boolean;
  enabled?: boolean;
  target?: React.RefObject<HTMLElement | null>;
  onAction: (id: TId, event: KeyboardEvent) => void;
}

export function useHotkeys<TId extends string>(
  defs: readonly HotkeyDef<TId>[],
  options: UseHotkeysOptions<TId>
): void {
  const stateRef = useRef({ defs, options });
  useEffect(() => {
    stateRef.current = { defs, options };
  });

  const signature = defs.map((def) => `${def.id}:${def.chord}:${def.repeat}`).join("\n");

  useEffect(() => {
    const readOptions = () => stateRef.current.options;
    const node = readOptions().target?.current ?? window;
    return subscribeHotkeys(node, {
      defs: stateRef.current.defs,
      capture: readOptions().capture,
      ignore: (event) => readOptions().ignore?.(event) ?? false,
      onAction: (id, event) => {
        if (readOptions().enabled === false) return;
        readOptions().onAction(id, event);
      },
    });
  }, [signature]);
}

/** A hotkey def pinned to a manifest entry, so its chord follows rebinds. */
export interface ResolvedHotkeyDef<TId extends string = string> extends HotkeyDef<TId> {
  keybindId: string;
}

/**
 * Drop-in `useHotkeys` that resolves each def's chord through the keybind
 * overrides: an overridden entry fires on its new chord, an unbound one is
 * left out (and unsubscribed). Untouched entries keep their own chord, so
 * physical aliases sharing one manifest id (arrows + letters) both survive
 * until a rebind collapses them. Local ids survive untouched, so `onAction`
 * keeps working exactly as before.
 */
export function useResolvedHotkeys<TId extends string>(
  defs: readonly ResolvedHotkeyDef<TId>[],
  options: UseHotkeysOptions<TId>
): void {
  const overrides = useCell(settingsAtoms.keybindOverrides);
  const resolved = useMemo(() => {
    const rows = resolveKeybinds(overrides);
    const byId = new Map(rows.map((row) => [row.entry.id, row]));
    const out: HotkeyDef<TId>[] = [];
    for (const def of defs) {
      const row = byId.get(def.keybindId);
      // No row (or a pristine one): the def's own chord stands, aliases
      // included. Only overridden or shadowed rows reroute.
      if (!row || (!row.overridden && !row.shadowedBy)) {
        out.push({ id: def.id, chord: def.chord, repeat: def.repeat });
        continue;
      }
      if (row.activeChord === null) continue;
      out.push({ id: def.id, chord: row.activeChord, repeat: def.repeat });
    }
    return out;
  }, [defs, overrides]);
  useHotkeys(resolved, options);
}
