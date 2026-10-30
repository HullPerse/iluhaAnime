import {
  Captions,
  Frame,
  Gauge,
  Keyboard,
  ListMusic,
  ListVideo,
  Maximize,
  Mic,
  Monitor,
  Pause,
  Pin,
  Play,
  RefreshCw,
  Settings,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Square,
  StepBack,
  StepForward,
  Tv,
  Volume2,
} from "lucide-react";

import type { ContextMenuEntry } from "@/components/shared/contextMenu.component";
import {
  PLAYER_CABINET_IDS,
  PLAYER_CABINETS,
  PLAYER_MODE_IDS,
  PLAYER_MODES,
} from "@/config/modes.config";
import { PLAYER_SPEEDS } from "@/lib/speed.utils";
import { selectableTracks, trackLabel } from "@/lib/tracks.utils";
import { buildVariantId, isSubtitleVariant, variantOf } from "@/lib/streamHelpers.utils";
import { formatClock } from "@/lib/time.utils";
import type { TranslationKey } from "@/types/i18n";
import type { StreamVariant } from "@/types/stream";
import type {
  EndOfFileMode,
  MpvChapter,
  MpvTrack,
  PlayerCabinetId,
  PlayerModeId,
  PlayerViewMode,
  StreamOpen,
} from "@/types/videoPlayer";

const EOF_MODES: EndOfFileMode[] = ["none", "pause", "next", "repeat"];

const EOF_LABELS = {
  none: "player.media.eof.none",
  pause: "player.media.eof.pause",
  next: "player.media.eof.next",
  repeat: "player.media.eof.repeat",
} as const;

const VIEW_MODES: PlayerViewMode[] = ["minimal", "compact", "normal"];

const VIEW_LABELS = {
  minimal: "player.media.view.minimal",
  compact: "player.media.view.compact",
  normal: "player.media.view.normal",
} as const;

const VIEW_HINTS: Record<PlayerViewMode, string> = {
  minimal: "1",
  compact: "2",
  normal: "3",
};

export interface ModernMenuStream {
  session: StreamOpen;
  /** Every row of the episode, voice-overs and subtitle translations alike. */
  variants: StreamVariant[];
  variantsLoading: boolean;
  variantsFailed: boolean;
  switching: boolean;
}

export interface ModernMenuSnapshot {
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
  /** Present only while a streaming session is playing. */
  stream: ModernMenuStream | null;
}

export interface ModernMenuActions {
  onPlayPause: () => void;
  onFrameStep: (forward: boolean) => void;
  onPrevFile: () => void;
  onNextFile: () => void;
  onSelectAudio: (id: number | "no") => void;
  onSelectSub: (id: number | "no") => void;
  onSeekTo: (time: number) => void;
  onSpeed: (value: number) => void;
  onTogglePlaylist: () => void;
  onToggleFullscreen: () => void;
  onViewMode: (mode: PlayerViewMode) => void;
  onToggleAlwaysOnTop: () => void;
  onEofMode: (mode: EndOfFileMode) => void;
  onPlayerMode: (mode: PlayerModeId) => void;
  onCabinet: (cabinet: PlayerCabinetId) => void;
  onOpenSettings: () => void;
  onOpenCheatsheet: () => void;
  onSelectVariant: (variant: StreamVariant) => void;
  onSelectQuality: (label: string) => void;
  onRetryVariants: () => void;
}

function trackEntries(
  kind: "audio" | "sub",
  tracks: MpvTrack[],
  select: (id: number | "no") => void
): ContextMenuEntry[] {
  const list = selectableTracks(tracks, kind);
  const offId = kind === "sub" ? "sub-off" : "audio-off";
  if (list.length === 0) {
    return [
      {
        kind: "item",
        id: offId,
        label: "player.media.controls.none",
        disabled: true,
        onSelect: () => {},
      },
    ];
  }
  const noneSelected = !list.some((track) => track.selected);
  const entries: ContextMenuEntry[] = [
    {
      kind: "item",
      id: offId,
      label: "player.media.controls.none",
      checked: noneSelected,
      onSelect: () => select("no"),
    },
    { kind: "separator", id: `${offId}-sep` },
  ];
  for (const track of list) {
    entries.push({
      kind: "item",
      id: `${offId}-${track.id}`,
      label: "player.media.menu.track",
      rawText: trackLabel(track),
      checked: track.selected === true,
      onSelect: () => select(track.id),
    });
  }
  return entries;
}

function chapterEntries(
  chapters: MpvChapter[],
  onSeekTo: (time: number) => void
): ContextMenuEntry[] {
  if (chapters.length === 0) {
    return [
      {
        kind: "item",
        id: "chapter-empty",
        label: "player.media.menu.no.chapters",
        disabled: true,
        onSelect: () => {},
      },
    ];
  }
  return chapters.map((chapter, index) => {
    const title = chapter.title.trim();
    return {
      kind: "item" as const,
      id: `chapter-${index}`,
      label: "player.media.menu.chapter" as const,
      labelVars: { n: index + 1 },
      rawText: title ? `${title} - ${formatClock(chapter.time)}` : undefined,
      onSelect: () => onSeekTo(chapter.time),
    };
  });
}

function disabledEntry(id: string, label: TranslationKey): ContextMenuEntry {
  return { kind: "item", id, label, disabled: true, onSelect: () => {} };
}

/**
 * The rows of one kind. A streaming subtitle is a separate stream, not an
 * embedded track, so it is selected from the same list the bar offers and the
 * selected row is the one that is playing.
 */
function streamVariantEntries(
  kind: "voice" | "sub",
  menu: ModernMenuStream,
  actions: ModernMenuActions
): ContextMenuEntry[] {
  const id = `stream-${kind}`;
  const list = menu.variants.filter((variant) => isSubtitleVariant(variant) === (kind === "sub"));
  if (menu.variantsLoading) {
    return [disabledEntry(`${id}-loading`, "player.stream.menu.loading")];
  }
  if (menu.variantsFailed) {
    return [
      disabledEntry(`${id}-failed`, "player.stream.voice.failed"),
      {
        kind: "item",
        id: `${id}-retry`,
        label: "player.stream.retry",
        icon: RefreshCw,
        onSelect: actions.onRetryVariants,
      },
    ];
  }
  if (list.length === 0) return [disabledEntry(`${id}-empty`, "player.media.tracks.empty")];
  const active = variantOf(list, menu.session.variantId);
  const activeId = active === null ? "" : buildVariantId(active);
  return list.map((variant) => {
    const variantId = buildVariantId(variant);
    return {
      kind: "item" as const,
      id: `${id}:${variantId}`,
      label: "player.media.menu.track" as const,
      rawText: variant.name,
      hint: variant.language || undefined,
      checked: variantId === activeId,
      onSelect: () => actions.onSelectVariant(variant),
    };
  });
}

/** Quality comes from the resolved source list, never a fixed table. */
function streamQualityEntries(
  menu: ModernMenuStream,
  actions: ModernMenuActions
): ContextMenuEntry[] {
  const labels = menu.session.sources.map((source) => source.label);
  if (labels.length === 0) {
    return [disabledEntry("stream-quality-empty", "player.media.tracks.empty")];
  }
  return labels.map((label) => ({
    kind: "item" as const,
    id: `stream-quality:${label}`,
    label: "player.stream.quality" as const,
    rawText: label,
    checked: label === menu.session.quality,
    onSelect: () => actions.onSelectQuality(label),
  }));
}

/**
 * Voice-over, subtitle stream and quality replace the mpv track lists while a
 * stream plays: the embedded tracks of one URL are not the choice the session
 * offers, and showing both would put two "subtitles" entries in one menu.
 */
function streamEntries(menu: ModernMenuStream, actions: ModernMenuActions): ContextMenuEntry[] {
  return [
    {
      kind: "submenu",
      id: "stream-voice",
      label: "player.stream.voice",
      icon: Mic,
      disabled: menu.switching,
      entries: streamVariantEntries("voice", menu, actions),
    },
    {
      kind: "submenu",
      id: "stream-subs",
      label: "player.media.tracks.subs.short",
      icon: Captions,
      disabled: menu.switching,
      entries: streamVariantEntries("sub", menu, actions),
    },
    {
      kind: "submenu",
      id: "stream-quality",
      label: "player.stream.quality",
      icon: SlidersHorizontal,
      disabled: menu.switching,
      entries: streamQualityEntries(menu, actions),
    },
    { kind: "separator", id: "sep-stream" },
  ];
}

export function buildModernPlayerMenu(
  snapshot: ModernMenuSnapshot,
  actions: ModernMenuActions
): ContextMenuEntry[] {
  const locked = !snapshot.hasFile;
  const trackChoices: ContextMenuEntry[] =
    snapshot.stream === null
      ? [
          {
            kind: "submenu",
            id: "subtitles",
            label: "player.media.tracks.subtitles",
            icon: Captions,
            disabled: locked,
            entries: trackEntries("sub", snapshot.tracks, actions.onSelectSub),
          },
          {
            kind: "submenu",
            id: "audio",
            label: "player.media.tracks.audio",
            icon: Volume2,
            disabled: locked,
            entries: trackEntries("audio", snapshot.tracks, actions.onSelectAudio),
          },
        ]
      : streamEntries(snapshot.stream, actions);
  return [
    {
      kind: "submenu",
      id: "playback",
      label: "player.media.menu.playback",
      icon: snapshot.paused ? Play : Pause,
      disabled: locked,
      entries: [
        {
          kind: "item",
          id: "playback-toggle",
          label: snapshot.paused ? "player.media.menu.play" : "player.media.menu.pause",
          icon: snapshot.paused ? Play : Pause,
          hint: "Space",
          onSelect: actions.onPlayPause,
        },
        {
          kind: "item",
          id: "playback-frame-back",
          label: "player.media.key.frame.backward",
          icon: StepBack,
          hint: ",",
          onSelect: () => actions.onFrameStep(false),
        },
        {
          kind: "item",
          id: "playback-frame-forward",
          label: "player.media.key.frame.forward",
          icon: StepForward,
          hint: ".",
          onSelect: () => actions.onFrameStep(true),
        },
        { kind: "separator", id: "playback-sep" },
        {
          kind: "item",
          id: "playback-prev",
          label: "player.media.key.file.prev",
          icon: SkipBack,
          hint: "PageUp",
          onSelect: actions.onPrevFile,
        },
        {
          kind: "item",
          id: "playback-next",
          label: "player.media.key.file.next",
          icon: SkipForward,
          hint: "PageDown",
          onSelect: actions.onNextFile,
        },
      ],
    },
    ...trackChoices,
    {
      kind: "submenu",
      id: "chapters",
      label: "player.media.menu.chapters",
      icon: ListVideo,
      disabled: locked,
      entries: chapterEntries(snapshot.chapters, actions.onSeekTo),
    },
    {
      kind: "submenu",
      id: "speed",
      label: "player.media.menu.speed",
      icon: Gauge,
      disabled: locked,
      entries: PLAYER_SPEEDS.map((value) => ({
        kind: "item" as const,
        id: `speed-${value}`,
        label: "player.media.menu.speed" as const,
        rawText: `${value}x`,
        checked: snapshot.speed === value,
        onSelect: () => actions.onSpeed(value),
      })),
    },
    { kind: "separator", id: "sep-view" },
    {
      kind: "submenu",
      id: "eof-mode",
      label: "player.media.controls.end.of.file",
      icon: Square,
      disabled: locked,
      entries: EOF_MODES.map((mode) => ({
        kind: "item" as const,
        id: `eof-${mode}`,
        label: EOF_LABELS[mode],
        checked: snapshot.eofMode === mode,
        onSelect: () => actions.onEofMode(mode),
      })),
    },
    {
      kind: "item",
      id: "toggle-playlist",
      label: "player.media.playlist.toggle",
      icon: ListMusic,
      hint: "L",
      checked: snapshot.playlistOpen,
      disabled: locked,
      onSelect: actions.onTogglePlaylist,
    },
    {
      kind: "item",
      id: "toggle-fullscreen",
      label: "player.media.panel.fullscreen",
      icon: Maximize,
      hint: "F",
      checked: snapshot.fullscreen,
      disabled: locked,
      onSelect: actions.onToggleFullscreen,
    },
    {
      kind: "submenu",
      id: "view-mode",
      label: "player.media.menu.view",
      icon: Monitor,
      entries: VIEW_MODES.map((mode) => ({
        kind: "item" as const,
        id: `view-${mode}`,
        label: VIEW_LABELS[mode],
        hint: VIEW_HINTS[mode],
        checked: snapshot.viewMode === mode,
        onSelect: () => actions.onViewMode(mode),
      })),
    },
    {
      kind: "submenu",
      id: "screen-mode",
      label: "player.media.settings.mode",
      icon: Tv,
      entries: PLAYER_MODE_IDS.map((mode) => ({
        kind: "item" as const,
        id: `screen-mode-${mode}`,
        label: PLAYER_MODES[mode].labelKey,
        checked: snapshot.playerMode === mode,
        onSelect: () => actions.onPlayerMode(mode),
      })),
    },
    {
      kind: "submenu",
      id: "screen-cabinet",
      label: "player.media.settings.cabinet",
      icon: Frame,
      entries: PLAYER_CABINET_IDS.map((cabinet) => ({
        kind: "item" as const,
        id: `screen-cabinet-${cabinet}`,
        label: PLAYER_CABINETS[cabinet],
        checked: snapshot.cabinet === cabinet,
        onSelect: () => actions.onCabinet(cabinet),
      })),
    },
    {
      kind: "item",
      id: "toggle-always-on-top",
      label: "player.media.key.always.on.top",
      icon: Pin,
      hint: "Ctrl+A",
      checked: snapshot.alwaysOnTop,
      onSelect: actions.onToggleAlwaysOnTop,
    },
    { kind: "separator", id: "sep-settings" },
    {
      kind: "item",
      id: "open-settings",
      label: "player.media.panel.settings",
      icon: Settings,
      onSelect: actions.onOpenSettings,
    },
    {
      kind: "item",
      id: "open-cheatsheet",
      label: "player.media.panel.cheatsheet",
      icon: Keyboard,
      hint: "?",
      onSelect: actions.onOpenCheatsheet,
    },
  ];
}
