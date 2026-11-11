import { useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";

import { ignore } from "@/lib/core/shared/promise.utils";
import { startFrameStep } from "@/lib/player/playback.utils";
import { buildModernPlayerMenu } from "@/routes/components/player/modern/menu.modern";
import type { ContextMenuEntry } from "@/types/ui/contextMenu";
import type { StreamVariant } from "@/types/player/stream";
import type {
  EndOfFileMode,
  MpvChapter,
  MpvTrack,
  PlayerCabinetId,
  PlayerModeId,
  PlayerSettings,
  PlayerViewMode,
  StreamOpen,
} from "@/types/player/videoPlayer";
import type { PlayerPanel } from "@/types/player/overlayState";

interface PlayerModernMenuDeps {
  enabled: boolean;
  hasFile: boolean;
  paused: boolean;
  tracks: MpvTrack[];
  chapters: MpvChapter[];
  playlistOpen: boolean;
  fullscreen: boolean;
  viewMode: PlayerViewMode;
  alwaysOnTop: boolean;
  speed: number;
  eofMode: EndOfFileMode;
  playerMode: PlayerModeId;
  cabinet: PlayerCabinetId;
  streamSession: StreamOpen | null;
  streamVariants: StreamVariant[];
  streamVariantsLoading: boolean;
  streamVariantsFailed: boolean;
  streamSwitching: boolean;
  onPlayPause: () => void;
  onPrevFile: () => void;
  onNextFile: () => void;
  onSelectTrack: (kind: "audio" | "sub") => (id: number | "no") => void;
  onSeekTo: (time: number) => void;
  onSpeed: (value: number) => void;
  setEofMode: (mode: EndOfFileMode) => void;
  toggleFullscreen: () => Promise<void>;
  applyViewMode: (mode: PlayerViewMode) => void;
  applyAlwaysOnTop: (value: boolean) => void;
  setPanel: Dispatch<SetStateAction<PlayerPanel>>;
  setPlaylistOpen: Dispatch<SetStateAction<boolean>>;
  handlePatchSettings: (patch: Partial<PlayerSettings>) => void;
  switchStreamVariant: (variant: StreamVariant) => Promise<boolean>;
  switchStreamQuality: (label: string) => Promise<boolean>;
  reloadStreamVariants: () => void;
}

export function usePlayerModernMenu({
  enabled,
  hasFile,
  paused,
  tracks,
  chapters,
  playlistOpen,
  fullscreen,
  viewMode,
  alwaysOnTop,
  speed,
  eofMode,
  playerMode,
  cabinet,
  streamSession,
  streamVariants,
  streamVariantsLoading,
  streamVariantsFailed,
  streamSwitching,
  onPlayPause,
  onPrevFile,
  onNextFile,
  onSelectTrack,
  onSeekTo,
  onSpeed,
  setEofMode,
  toggleFullscreen,
  applyViewMode,
  applyAlwaysOnTop,
  setPanel,
  setPlaylistOpen,
  handlePatchSettings,
  switchStreamVariant,
  switchStreamQuality,
  reloadStreamVariants,
}: PlayerModernMenuDeps): ContextMenuEntry[] {
  return useMemo(() => {
    if (!enabled) return [];
    return buildModernPlayerMenu(
      {
        hasFile,
        paused,
        tracks,
        chapters,
        playlistOpen,
        fullscreen,
        viewMode,
        alwaysOnTop,
        speed,
        eofMode,
        playerMode,
        cabinet,
        stream:
          streamSession === null
            ? null
            : {
                session: streamSession,
                variants: streamVariants,
                variantsLoading: streamVariantsLoading,
                variantsFailed: streamVariantsFailed,
                switching: streamSwitching,
              },
      },
      {
        onPlayPause,
        onFrameStep: (forward) => ignore(startFrameStep(forward)),
        onPrevFile,
        onNextFile,
        onSelectAudio: onSelectTrack("audio"),
        onSelectSub: onSelectTrack("sub"),
        onSeekTo,
        onSpeed,
        onTogglePlaylist: () => setPlaylistOpen((previous) => !previous),
        onToggleFullscreen: () => ignore(toggleFullscreen()),
        onViewMode: applyViewMode,
        onToggleAlwaysOnTop: () => applyAlwaysOnTop(!alwaysOnTop),
        onEofMode: setEofMode,
        onPlayerMode: (mode) => handlePatchSettings({ playerMode: mode }),
        onCabinet: (value) => handlePatchSettings({ cabinet: value }),
        onOpenSettings: () => setPanel("settings"),
        onOpenCheatsheet: () => setPanel("cheatsheet"),
        onSelectVariant: (variant) => ignore(switchStreamVariant(variant)),
        onSelectQuality: (label) => ignore(switchStreamQuality(label)),
        onRetryVariants: reloadStreamVariants,
      }
    );
  }, [
    enabled,
    hasFile,
    paused,
    tracks,
    chapters,
    playlistOpen,
    fullscreen,
    viewMode,
    alwaysOnTop,
    speed,
    eofMode,
    playerMode,
    cabinet,
    streamSession,
    streamVariants,
    streamVariantsLoading,
    streamVariantsFailed,
    streamSwitching,
    onPlayPause,
    onPrevFile,
    onNextFile,
    onSelectTrack,
    onSeekTo,
    onSpeed,
    setEofMode,
    toggleFullscreen,
    applyViewMode,
    applyAlwaysOnTop,
    setPanel,
    setPlaylistOpen,
    handlePatchSettings,
    switchStreamVariant,
    switchStreamQuality,
    reloadStreamVariants,
  ]);
}
