export interface VideoStreamInfo {
  index: number;
  codec_type: string;
  codec_name: string;
  language: string | null;
  title: string | null;
  is_default: boolean;
  is_forced: boolean;
  is_comment: boolean;
  bit_rate?: number | null;
  channels?: number | null;
  sample_rate?: number | null;
  width?: number | null;
  height?: number | null;
  file_path?: string | null;
}

export type VideoType = {
  path: string;
  file: string;
  initialTime?: number;
  audioSrc?: string;
  subPath?: string;
  subFonts?: string[];
  subIsAss?: boolean;
} | null;

export type ChapterType = {
  start_time: number;
  end_time: number;
  title: string;
};

export type FFMPEGStatus = "checking" | "ok" | "missing" | "downloading";
export type ScanType = {
  current: number;
  total: number;
} | null;

export interface MediaEntry {
  path: string;
  position: number;
  audioTrack?: number;
  subtitleTrack?: number;
  subOffset: number;
  audioOffset: number;
  lastPlayed: number;
}

export interface MediaStore {
  entries: MediaEntry[];
  getEntry: (path: string) => MediaEntry | undefined;
  setPosition: (path: string, time: number) => void;
  setTrack: (path: string, type: "audio" | "sub", index: number) => void;
  setSubOffset: (path: string, offset: number) => void;
  setAudioOffset: (path: string, offset: number) => void;
  clearEntries: () => void;
}

export interface PlayerSettings {
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  zoom: number;
  aspectRatio: "contain" | "cover" | "fill" | "none" | "scale-down";
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  blur: number;
  sepia: number;
  grayscale: number;
  subFontSize: number;
  subFontFamily: string;
  subColor: string;
  subBgOpacity: number;
  subBgColor: string;
}

export interface PlayerStore {
  volume: number;
  folderPaths: string[];
  settings: PlayerSettings;
  setVolume: (v: number) => void;
  setFolderPaths: (paths: string[]) => void;
  patchSettings: (p: Partial<PlayerSettings>) => void;
}
