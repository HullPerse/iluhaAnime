import { beforeEach, describe, expect, it } from "vitest";

import { useSessionStore } from "@/store/session.store";
import type { SessionIdentity } from "@/types/session";

const IDENTITY: SessionIdentity = {
  displayName: "Guest",
  peerId: "peer-1",
  role: "guest",
  sessionId: "a1b2c3d4e5f60718",
  ticket: {
    endpointId: "ab".repeat(32),
    sessionId: "a1b2c3d4e5f60718",
    token: "0123456789abcdef0123456789abcdef",
  },
};

beforeEach(() => {
  localStorage.clear();
  useSessionStore.setState({ identity: null, planPaths: {} });
});

describe("session store identity persistence", () => {
  it("persists only the identity record, never local paths", () => {
    useSessionStore.getState().setIdentity(IDENTITY);
    useSessionStore.getState().setPlanPath("i1", "C:/private/episode.mkv");

    const raw = localStorage.getItem("sessionIdentity");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string);
    expect(parsed.state.identity).toEqual(IDENTITY);
    expect(parsed.state.planPaths).toBeUndefined();
    expect(JSON.stringify(parsed)).not.toContain("private");
  });

  it("rehydrates the identity after a reload", async () => {
    useSessionStore.getState().setIdentity(IDENTITY);
    // Capture the persisted payload, then simulate a fresh page whose store
    // starts empty but whose localStorage still holds the last write.
    const stored = localStorage.getItem("sessionIdentity");
    expect(stored).toBeTruthy();
    useSessionStore.setState({ identity: null });
    localStorage.setItem("sessionIdentity", stored as string);

    await useSessionStore.persist.rehydrate();

    expect(useSessionStore.getState().identity).toEqual(IDENTITY);
  });

  it("clears the identity on reset", () => {
    useSessionStore.getState().setIdentity(IDENTITY);
    useSessionStore.getState().reset();
    expect(useSessionStore.getState().identity).toBeNull();
  });

  it("arms the chat reply target and clears it on reset", () => {
    useSessionStore.getState().setChatReply("m1");
    expect(useSessionStore.getState().chatReply).toBe("m1");

    useSessionStore.getState().reset();
    expect(useSessionStore.getState().chatReply).toBeNull();
  });
});
