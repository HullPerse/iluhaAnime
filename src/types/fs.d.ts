export interface VideoFileEntry {
  path: string;
  name: string;
  size: number;
}

export interface FolderScanResult {
  path: string;
  entries: VideoFileEntry[];
  skipped: number;
}

export interface MediaTrack {
  id: number;
  kind: "video" | "audio" | "subtitle";
  codec: string | null;
  language: string | null;
  title: string | null;
}
