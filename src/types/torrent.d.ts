export interface Anime {
  title: string;
  magnet: string;
  torrent: string;
  size: string;
  seeders: number;
  leechers: number;
  category: string;
  link: string;
}

export type FilePriority = "do_not_download" | "low" | "normal" | "high";

export interface VideoFileEntry {
  readonly path: string;
  readonly name: string;
  readonly size: number;
}

export interface FolderNode {
  name: string;
  path: string;
  files: VideoFileEntry[];
  children: FolderNode[];
}
