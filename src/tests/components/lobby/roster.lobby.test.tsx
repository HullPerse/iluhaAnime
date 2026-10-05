import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import RosterLobby from "@/routes/components/lobby/roster.lobby";
import { useSettingsStore } from "@/store/settings.store";
import type { PeerInfo } from "@/types/session";

function peer(overrides: Partial<PeerInfo> = {}): PeerInfo {
  return {
    anilistUserId: null,
    avatarSeed: "seed",
    buffering: false,
    connection: "direct",
    displayName: "Alice",
    driftMs: 12.4,
    endpointId: "end-p1",
    left: false,
    peerId: "p1",
    ready: true,
    role: "viewer",
    rttMs: 45.6,
    ...overrides,
  };
}

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

afterEach(() => {
  cleanup();
});

describe("RosterLobby", () => {
  it("shows an empty placeholder before anyone joins", () => {
    render(<RosterLobby peers={[]} />);

    expect(screen.getByText("Peers")).toBeTruthy();
    expect(screen.getByText("No peers yet.")).toBeTruthy();
  });

  it("shows the avatar letter, rounded stats, and connection state", () => {
    render(<RosterLobby peers={[peer({ displayName: "bob", driftMs: 12.4, rttMs: 45.6 })]} />);

    // The avatar is the first letter, uppercased.
    expect(screen.getByText("B")).toBeTruthy();
    expect(screen.getByText("bob")).toBeTruthy();
    expect(screen.getByText("46 ms ping, 12 ms drift")).toBeTruthy();
    expect(screen.getByText("direct")).toBeTruthy();
  });

  it("falls back to a question mark for a blank display name", () => {
    render(<RosterLobby peers={[peer({ displayName: "   " })]} />);

    expect(screen.getByText("?")).toBeTruthy();
  });

  it("marks the host peer with the host suffix", () => {
    render(<RosterLobby peers={[peer({ displayName: "Alice", role: "host" })]} />);

    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("· Host")).toBeTruthy();
  });

  it("does not add the host suffix for a viewer", () => {
    render(<RosterLobby peers={[peer({ displayName: "Bob", role: "viewer" })]} />);

    expect(screen.queryByText("· Host")).toBeNull();
  });

  it("marks a moderator peer with the moderator suffix", () => {
    render(
      <RosterLobby
        lobbyRole="viewer"
        peers={[peer({ displayName: "Bob", role: "moderator" })]}
      />
    );

    expect(screen.getByText("· Moderator")).toBeTruthy();
  });

  it("shows a missing-files badge for peers without the file", () => {
    render(
      <RosterLobby
        missingByPeer={{ p2: 2 }}
        peers={[
          peer({ displayName: "Alice", peerId: "p1" }),
          peer({ displayName: "Bob", peerId: "p2" }),
        ]}
      />
    );

    expect(screen.getByText("Missing 2")).toBeTruthy();
  });

  it("lets the host promote a viewer and demote a moderator", async () => {
    const user = userEvent.setup();
    const onSetRole = vi.fn();
    render(
      <RosterLobby
        lobbyRole="host"
        peers={[
          peer({ displayName: "Alice", peerId: "p1", role: "host" }),
          peer({ displayName: "Bob", peerId: "p2", role: "viewer" }),
          peer({ displayName: "Cara", peerId: "p3", role: "moderator" }),
        ]}
        onSetRole={onSetRole}
      />
    );

    // The host peer itself has no role control.
    expect(screen.getAllByTitle(/Make (moderator|viewer)/)).toHaveLength(2);

    await user.click(screen.getByTitle("Make moderator"));
    expect(onSetRole).toHaveBeenCalledWith("p2", "moderator");

    await user.click(screen.getByTitle("Make viewer"));
    expect(onSetRole).toHaveBeenCalledWith("p3", "viewer");
  });

  it("hides the role controls for a non-host", () => {
    render(
      <RosterLobby
        lobbyRole="viewer"
        onSetRole={() => {}}
        peers={[peer({ displayName: "Bob", role: "viewer" })]}
      />
    );

    expect(screen.queryByTitle("Make moderator")).toBeNull();
  });

  it("marks a peer that left past the grace window", () => {
    render(
      <RosterLobby
        peers={[
          peer({
            connection: "disconnected",
            displayName: "Alice",
            left: true,
            peerId: "p1",
          }),
        ]}
      />
    );

    expect(screen.getByText("left")).toBeTruthy();
    // The connection label is replaced by the left badge.
    expect(screen.queryByText("disconnected")).toBeNull();
  });

  it("renders every peer in the roster", () => {
    render(
      <RosterLobby
        peers={[
          peer({ displayName: "Alice", peerId: "p1" }),
          peer({ displayName: "Bob", peerId: "p2" }),
          peer({ displayName: "Cara", peerId: "p3" }),
        ]}
      />
    );

    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("Bob")).toBeTruthy();
    expect(screen.getByText("Cara")).toBeTruthy();
  });
});
