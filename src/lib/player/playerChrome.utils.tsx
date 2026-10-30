import { cn } from "cn";
import type { ReactNode } from "react";

import ContextMenu from "@/components/shared/contextMenu.component";
import type { ContextMenuEntry } from "@/types/ui/contextMenu";
import type { TranslationKey, TranslationVariables } from "@/types/core/i18n";
import type { FilePlaybackState } from "@/types/player/playback";
import type { HwdecReload } from "@/types/player/resume";
import type { MediaEntry } from "@/types/player/videoPlayer";
import type { StreamOpen } from "@/types/player/videoPlayer";
import { fileNameFromPath } from "@/lib/search/parse.utils";
import { formatParsedTitle } from "@/lib/player/playerTitle.utils";
import { setPaused } from "@/lib/player/playback.utils";
import type { DroppedFramesData } from "@/types/player/videoPlayer";

export interface CursorHiddenState {
  barsHidden: boolean;
  panelOpen: boolean;
  jumpOpen: boolean;
  diagnosticsOpen: boolean;
  playlistOpen: boolean;
  menuOpen: boolean;
  dropAlert: DroppedFramesData | null;
}

export const barClass = (
  position: "top" | "bottom",
  immersive: boolean,
  hidden: boolean
): string => {
  if (!immersive) return "z-20 shrink-0 bg-primary";
  return cn(
    "bg-primary/90 absolute inset-x-0 z-20 shrink-0 transition-opacity duration-300",
    position === "top" ? "top-0" : "bottom-0",
    hidden && "pointer-events-none opacity-0"
  );
};

export const videoSectionClass = (immersive: boolean): string => {
  if (immersive) return "relative min-h-0 flex-1 overflow-hidden";
  return "relative m-1 min-h-0 flex-1 overflow-hidden windows95-active-border";
};

export const navigationAvailability = ({
  stream,
  hasNextEpisode,
  playlistCount,
  playlistIndex,
}: {
  stream: boolean;
  hasNextEpisode: boolean;
  playlistCount: number;
  playlistIndex: number;
}): { hasNext: boolean; hasPrev: boolean } => {
  if (stream) return { hasNext: hasNextEpisode, hasPrev: false };
  return {
    hasNext: playlistCount > 0 && playlistIndex < playlistCount - 1,
    hasPrev: playlistIndex > 0,
  };
};

export const shouldReleaseStreamPin = (state: {
  streamResume: number | null;
  loadingFile: boolean;
  playbackTime: number;
  pinnedUrl: string | null;
  currentUrl: string | null;
}): boolean => {
  if (state.streamResume === null || state.loadingFile) return false;
  if (state.pinnedUrl !== null && state.currentUrl === state.pinnedUrl) return false;
  return Math.abs(state.playbackTime - state.streamResume) <= 2;
};

export const shouldHideCursor = (state: CursorHiddenState): boolean => {
  return (
    state.barsHidden &&
    !state.panelOpen &&
    !state.jumpOpen &&
    !state.diagnosticsOpen &&
    !state.playlistOpen &&
    !state.menuOpen &&
    state.dropAlert === null
  );
};

export const rootClass = (hasFile: boolean, failed: boolean, cursorHidden: boolean): string => {
  return cn(
    "relative flex h-screen w-screen flex-col overflow-hidden",
    (!hasFile || failed) && "bg-black",
    cursorHidden && "player-cursor-hidden"
  );
};

export const restoreReloadPaused = async (reload: HwdecReload | null): Promise<void> => {
  if (reload && !reload.paused) await setPaused(false);
};

export const fileStatePatch = (entry: MediaEntry | undefined, speed: number): FilePlaybackState => {
  return {
    speed,
    subDelay: entry?.subOffset ?? 0,
    audioDelay: entry?.audioOffset ?? 0,
    audioTrack: typeof entry?.audioTrack === "number" ? entry.audioTrack : undefined,
    subtitleTrack: typeof entry?.subtitleTrack === "number" ? entry.subtitleTrack : undefined,
  };
};

export const modernMenuEnabled = (
  playerType: "default" | "modern",
  contextMenu: boolean
): boolean => {
  return playerType === "modern" || contextMenu;
};

export const hideDefaultTracks = (
  playerType: "default" | "modern",
  contextMenu: boolean
): boolean => {
  return playerType === "default" && contextMenu;
};

export const wrapVideoMenu = (
  node: ReactNode,
  enabled: boolean,
  entries: ContextMenuEntry[],
  onOpenChange: (open: boolean) => void
): ReactNode => {
  if (!enabled) return node;
  return (
    <ContextMenu entries={entries} onOpenChange={onOpenChange}>
      {node}
    </ContextMenu>
  );
};

export const playerWindowTitle = ({
  path,
  stream,
  parseTitlesPlayer,
  t,
}: {
  path: string;
  stream: StreamOpen | null;
  parseTitlesPlayer: boolean;
  t: (key: TranslationKey, variables?: TranslationVariables) => string;
}): string => {
  if (stream) {
    const episode = stream.episodeTitle
      ? t("player.title.episode.colon", { title: stream.episodeTitle })
      : t("player.title.episode", { n: stream.episodeNumber });
    return `${stream.mediaTitle} - ${episode}`;
  }
  if (!path) return t("player.media.title");
  return parseTitlesPlayer ? formatParsedTitle(path, t) : fileNameFromPath(path);
};
