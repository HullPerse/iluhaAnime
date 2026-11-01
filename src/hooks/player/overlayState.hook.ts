import { useCallback, useState } from "react";

import type { PlayerOverlayState, PlayerPanel } from "@/types/player/overlayState";

export function usePlayerOverlayState(): PlayerOverlayState {
  const [panel, setPanel] = useState<PlayerPanel>(null);
  const [jumpOpen, setJumpOpen] = useState<boolean>(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState<boolean>(false);
  const [playlistOpen, setPlaylistOpen] = useState<boolean>(false);
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [playlistFocus, setPlaylistFocus] = useState<number | null>(null);

  const closeOverlay = useCallback(() => {
    if (diagnosticsOpen) {
      setDiagnosticsOpen(false);
      return true;
    }
    if (playlistOpen) {
      setPlaylistOpen(false);
      return true;
    }
    if (panel !== null) {
      setPanel(null);
      return true;
    }
    if (jumpOpen) {
      setJumpOpen(false);
      return true;
    }
    return false;
  }, [diagnosticsOpen, jumpOpen, panel, playlistOpen]);

  const onToggleDiagnostics = useCallback(() => {
    setDiagnosticsOpen((value) => !value);
  }, []);

  const onToggleCheatsheet = useCallback(() => {
    setPanel((prev) => (prev === "cheatsheet" ? null : "cheatsheet"));
  }, []);

  const onTogglePlaylist = useCallback(() => {
    setPlaylistOpen((previous) => !previous);
  }, []);

  const onOpenJump = useCallback(() => {
    setJumpOpen(true);
  }, []);

  return {
    panel,
    setPanel,
    jumpOpen,
    setJumpOpen,
    diagnosticsOpen,
    setDiagnosticsOpen,
    playlistOpen,
    setPlaylistOpen,
    menuOpen,
    setMenuOpen,
    playlistFocus,
    setPlaylistFocus,
    closeOverlay,
    onToggleDiagnostics,
    onToggleCheatsheet,
    onTogglePlaylist,
    onOpenJump,
  };
}
