import type { SessionIdentity, SessionRole, SessionTicket } from "@/types/session";

// Hosting is never restored.
export type RestoreDecision =
  | { kind: "fresh" }
  | {
      kind: "reconnect";
      ticket: SessionTicket;
      displayName: string;
      peerId: string | null;
    }
  | { kind: "closed" };

// Live session wins; stored is stale while one runs.
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
