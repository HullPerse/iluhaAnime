import { describe, expect, it } from "vitest";

import { restoreDecision } from "@/lib/session/restore.utils";
import type { SessionIdentity, SessionTicket } from "@/types/session";

const TICKET: SessionTicket = {
  endpointId: "ab".repeat(32),
  sessionId: "a1b2c3d4e5f60718",
  token: "0123456789abcdef0123456789abcdef",
};

const GUEST_IDENTITY: SessionIdentity = {
  displayName: "Guest",
  peerId: "peer-1",
  role: "guest",
  sessionId: TICKET.sessionId,
  ticket: TICKET,
};

const HOST_IDENTITY: SessionIdentity = {
  ...GUEST_IDENTITY,
  peerId: null,
  role: "host",
};

describe("restoreDecision", () => {
  it("stays fresh without a saved identity", () => {
    expect(restoreDecision(null, null)).toEqual({ kind: "fresh" });
  });

  it("stays fresh while a session is already active", () => {
    expect(restoreDecision(GUEST_IDENTITY, "guest")).toEqual({ kind: "fresh" });
    expect(restoreDecision(HOST_IDENTITY, "host")).toEqual({ kind: "fresh" });
  });

  it("reconnects a saved guest with its ticket and peer id", () => {
    expect(restoreDecision(GUEST_IDENTITY, null)).toEqual({
      displayName: "Guest",
      kind: "reconnect",
      peerId: "peer-1",
      ticket: TICKET,
    });
  });

  it("reports a saved host room as closed", () => {
    expect(restoreDecision(HOST_IDENTITY, null)).toEqual({ kind: "closed" });
  });
});
