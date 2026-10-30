import type { GamePlatform } from "@/types/core/game";

export interface GameImportDraft {
  path: string;
  platform: GamePlatform;
  name: string | undefined;
}

export interface GameImportModalProps {
  filePath: string;
  platforms: readonly GamePlatform[];
  busy: boolean;
  onConfirm: (draft: GameImportDraft) => void;
  onClose: () => void;
}
