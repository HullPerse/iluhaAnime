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
