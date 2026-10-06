import type { PeerInfo } from "@/types/session";

const rank = (peer: PeerInfo): number => (peer.role === "moderator" ? 0 : 1);

// Moderators first, deterministic id tie-break; host never candidate.
export function transferCandidates(peers: readonly PeerInfo[]): PeerInfo[] {
  return peers
    .filter((peer) => peer.role !== "host")
    .sort((a, b) => rank(a) - rank(b) || a.peerId.localeCompare(b.peerId));
}
