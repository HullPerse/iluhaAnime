import type { PeerInfo } from "@/types/session";

/** Role rank for choosing a successor: moderators before viewers. */
const rank = (peer: PeerInfo): number => (peer.role === "moderator" ? 0 : 1);

/**
 * Peers the outgoing host may hand the room to, in hierarchy order:
 * moderators first, then viewers, each group ordered by peer id — the roster
 * comes from a map and carries no join order, so the id keeps the default
 * pick deterministic. The host entry is this instance and never a candidate.
 */
export function transferCandidates(peers: readonly PeerInfo[]): PeerInfo[] {
  return peers
    .filter((peer) => peer.role !== "host")
    .sort((a, b) => rank(a) - rank(b) || a.peerId.localeCompare(b.peerId));
}
