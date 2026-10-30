import type { HwdecMode, PlayerSettings } from "@/types/videoPlayer";

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
  subtitleTrack?: number;
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
