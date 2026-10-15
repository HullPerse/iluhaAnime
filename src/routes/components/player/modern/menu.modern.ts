import {
  Captions,
  Gauge,
  Keyboard,
  ListMusic,
  ListVideo,
  Maximize,
  Pause,
  Play,
  Settings,
  SkipBack,
  SkipForward,
  Square,
  StepBack,
  StepForward,
  Volume2,
} from "lucide-react";

import type { ContextMenuEntry } from "@/components/shared/contextMenu.component";
import { selectableTracks, trackLabel } from "@/lib/player/tracks.utils";
import { PLAYER_SPEEDS } from "@/lib/player/speed.utils";
import { formatClock } from "@/lib/utils/time.utils";
import type { EndOfFileMode, MpvChapter, MpvTrack } from "@/types/videoPlayer";

const EOF_MODES: EndOfFileMode[] = ["none", "pause", "next", "repeat"];

const EOF_LABELS = {
  none: "player.media.eof.none",
  pause: "player.media.eof.pause",
  next: "player.media.eof.next",
  repeat: "player.media.eof.repeat",
} as const;

export interface ModernMenuSnapshot {
  hasFile: boolean;
  paused: boolean;
  tracks: MpvTrack[];
  chapters: MpvChapter[];
  playlistOpen: boolean;
  fullscreen: boolean;
  speed: number;
  eofMode: EndOfFileMode;
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
  onEofMode: (mode: EndOfFileMode) => void;
  onOpenSettings: () => void;
  onOpenCheatsheet: () => void;
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

function chapterEntries(chapters: MpvChapter[], onSeekTo: (time: number) => void): ContextMenuEntry[] {
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

export function buildModernPlayerMenu(
  snapshot: ModernMenuSnapshot,
  actions: ModernMenuActions
): ContextMenuEntry[] {
  const locked = !snapshot.hasFile;
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
