export type TorrentTagKey = "quality" | "codec" | "lang" | "seeds" | "size" | "source";

export interface TorrentTag {
  key: TorrentTagKey;
  op: string;
  value: string;
  raw: string;
  start: number;
  end: number;
}

export interface ParsedTorrentTags {
  cleanQuery: string;
  tags: TorrentTag[];
}
