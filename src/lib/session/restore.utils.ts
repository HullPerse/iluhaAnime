import type { SessionIdentity, SessionRole, SessionTicket } from "@/types/session";

/**
 * What the app should do with a persisted identity when the lobby mounts.
 *
 * - `fresh`: nothing saved, or a session is already active.
 * - `reconnect`: a saved guest ticket can be dialed again (same peer id and
 *   token) instead of showing the join form.
 * - `closed`: the saved identity was a host room; v1 never restores hosting,
 *   so the room is reported as closed instead of offering a dead reconnect.
 */
export type RestoreDecision =
  | { kind: "fresh" }
  | {
      kind: "reconnect";
      ticket: SessionTicket;
      displayName: string;
      peerId: string | null;
    }
  | { kind: "closed" };

/**
 * Decide the startup action from the persisted identity and the live role.
 * A live session always wins: the stored identity is stale while one runs.
 */
export function restoreDecision(
  identity: SessionIdentity | null,
  currentRole: SessionRole | null
): RestoreDecision {
  if (identity === null || currentRole !== null) {
    return { kind: "fresh" };
  }
  if (identity.role === "host") {
    return { kind: "closed" };
  }
  return {
    kind: "reconnect",
    ticket: identity.ticket,
    displayName: identity.displayName,
    peerId: identity.peerId,
  };
}
