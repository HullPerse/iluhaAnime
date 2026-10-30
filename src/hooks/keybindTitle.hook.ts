import { useMemo } from "react";

import { humanizeChord } from "@/lib/chordHotkeys.utils";
import { activeChordForKeybind, formatKeybindTitle } from "@/lib/titleHotkeys.utils";
import { useCell } from "@/lib/signal.hook";
import { settingsAtoms } from "@/store/settings.store";

export function useKeybindTitle(title: string, keybindId: string): string {
  const overrides = useCell(settingsAtoms.keybindOverrides);
  return useMemo(
    () => formatKeybindTitle(title, activeChordForKeybind(overrides, keybindId)),
    [title, overrides, keybindId]
  );
}

export function useKeybindChord(keybindId: string): string | null {
  const overrides = useCell(settingsAtoms.keybindOverrides);
  return useMemo(() => {
    const chord = activeChordForKeybind(overrides, keybindId);
    return chord ? humanizeChord(chord) : null;
  }, [overrides, keybindId]);
}
