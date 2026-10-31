import type { GameRomInfo } from "@/types/core/game";
import type { Play } from "lucide-react";

export interface GameLibraryProps {
  roms: GameRomInfo[];
  activeId: string | null;
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
