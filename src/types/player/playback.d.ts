import type { HwdecMode, PlayerSettings } from "@/types/player/videoPlayer";

export interface TorrentPlaylistSource {
  name: string;
  fullPath?: string;
  completed: boolean;
  exists: boolean;
}

export interface MpvInitParams {
  volume: number;
  hwdec: HwdecMode;
  settings: PlayerSettings;
}

export interface FilePlaybackState {
  speed: number;
  subDelay: number;
  audioDelay: number;
  audioTrack?: number;
  audioTrackKey?: string;
  subtitleTrack?: number | "no";
  subtitleTrackKey?: string;
}

export interface PlaylistEntry {
  index: number;
  filename: string;
  title: string;
}

export interface VideoCardInfo {
  path: string;
  duration: number;
  size: number;
}
