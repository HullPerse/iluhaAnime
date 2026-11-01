export type TorrentBulkKind = "pause" | "resume" | "recheck" | "remove" | "trackers" | "limits";

export interface TorrentBulkPayload {
  tracker?: string;
  downloadBps?: number | null;
  uploadBps?: number | null;
}
