import type { Dispatch, SetStateAction } from "react";

export type PlayerPanel = null | "settings" | "cheatsheet";

export interface PlayerOverlayState {
  panel: PlayerPanel;
  setPanel: Dispatch<SetStateAction<PlayerPanel>>;
  jumpOpen: boolean;
  setJumpOpen: Dispatch<SetStateAction<boolean>>;
  diagnosticsOpen: boolean;
  setDiagnosticsOpen: Dispatch<SetStateAction<boolean>>;
  playlistOpen: boolean;
  setPlaylistOpen: Dispatch<SetStateAction<boolean>>;
  menuOpen: boolean;
  setMenuOpen: Dispatch<SetStateAction<boolean>>;
  playlistFocus: number | null;
  setPlaylistFocus: Dispatch<SetStateAction<number | null>>;
  closeOverlay: () => boolean;
  onToggleDiagnostics: () => void;
  onToggleCheatsheet: () => void;
  onTogglePlaylist: () => void;
  onOpenJump: () => void;
}
