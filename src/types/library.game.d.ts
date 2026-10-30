import type { GameRomInfo } from "@/types/game";
import type { Play } from "lucide-react";

export interface GameLibraryProps {
  roms: GameRomInfo[];
  activeId: string | null;
  /** ROM being started right now; its row shows a spinner instead of an idle Play. */
  startingId: string | null;
  importPending: boolean;
  deletingId: string | null;
  loading: boolean;
  error: string | null;
  onImport: () => void;
  onOpenStore: () => void;
  onPlay: (rom: GameRomInfo) => void;
  onDelete: (rom: GameRomInfo) => void;
  onReload: () => void;
}
