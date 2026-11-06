import { useEffect, useMemo, useRef } from "react";

import type { HotkeyDef } from "@/types/core/chordHotkeys";
import { subscribeHotkeys } from "@/lib/core/hotkeys/registryHotkeys.utils";
import { resolveKeybinds } from "@/lib/search/resolveHotkeys.utils";
import { useCell } from "@hullperse/hp_utils/react";
import { settingsAtoms } from "@/store/settings.store";
import type { ResolvedHotkeyDef, UseHotkeysOptions } from "@/types/ui/hotkeys";

function hotkeySignature<TId extends string>(defs: readonly HotkeyDef<TId>[]): string {
  return defs.map((def) => `${def.id}:${def.chord}:${def.repeat}`).join("\n");
}

export function useHotkeys<TId extends string>(
  defs: readonly HotkeyDef<TId>[],
  options: UseHotkeysOptions<TId>
): void {
  const stateRef = useRef<{
    defs: readonly HotkeyDef<TId>[];
    options: UseHotkeysOptions<TId>;
  }>({ defs, options });
  useEffect(() => {
    stateRef.current = { defs, options };
  });

  const signature = hotkeySignature(defs);

  useEffect(() => {
    const current = stateRef.current;
    if (hotkeySignature(current.defs) !== signature) return;
    const readOptions = () => stateRef.current.options;
    const node = readOptions().target?.current ?? window;
    return subscribeHotkeys(node, {
      defs: current.defs,
      capture: readOptions().capture,
      ignore: (event) => readOptions().ignore?.(event) ?? false,
      onAction: (id, event) => {
        if (readOptions().enabled === false) return;
        readOptions().onAction(id, event);
      },
    });
  }, [signature]);
}

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
