import type { CoverCandidate } from "@/types/cover";

export type TorrentCoverStatus = "override" | "page" | "resolved" | "pending" | "empty";

export interface TorrentCoverState {
  status: TorrentCoverStatus;
  coverUrl: string | null;
  remoteUrl: string | null;
  anilistId: number | null;
  candidates: CoverCandidate[];
  coverKey: string;
}
