import type { RowKeyAction } from "@/types/player/episodes.stream";
import type { ResolvedHotkeyDef } from "@/types/ui/hotkeys";

export const EPISODE_FILTER_THRESHOLD = 24;

export const EPISODE_ROW_KEYBINDS: ResolvedHotkeyDef<RowKeyAction>[] = [
  { id: "row-up", chord: "ArrowUp", repeat: "hold", keybindId: "tree.move.up" },
  { id: "row-down", chord: "ArrowDown", repeat: "hold", keybindId: "tree.move.down" },
  { id: "row-up", chord: "KeyK", repeat: "hold", keybindId: "tree.move.up" },
  { id: "row-down", chord: "KeyJ", repeat: "hold", keybindId: "tree.move.down" },
];
