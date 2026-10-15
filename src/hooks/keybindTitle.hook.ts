import { useMemo } from "react";

import { humanizeChord } from "@/lib/hotkeys/chord.hotkeys";
import { activeChordForKeybind, formatKeybindTitle } from "@/lib/hotkeys/title.hotkeys";
import { useCell } from "@/lib/state/signal.hook";
import { settingsAtoms } from "@/store/settings.store";

/** Tooltip text with the live keybind prefix: `[P]: Pause`. Follows rebinds. */
export function useKeybindTitle(title: string, keybindId: string): string {
  const overrides = useCell(settingsAtoms.keybindOverrides);
  return useMemo(
    () => formatKeybindTitle(title, activeChordForKeybind(overrides, keybindId)),
    [title, overrides, keybindId]
  );
}

/** Humanized live chord (`P`, `Ctrl+K`, `[`), or null when unbound. */
export function useKeybindChord(keybindId: string): string | null {
  const overrides = useCell(settingsAtoms.keybindOverrides);
  return useMemo(() => {
    const chord = activeChordForKeybind(overrides, keybindId);
    return chord ? humanizeChord(chord) : null;
  }, [overrides, keybindId]);
}
