import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import LobbyPanel from "@/routes/components/player/lobby.player";
import { useSettingsStore } from "@/store/settings.store";
import type { PeerInfo, SessionRole, SessionStatus, SyncSample } from "@/types/session";

const HOST_PEER: PeerInfo = {
  avatarSeed: "h",
  anilistUserId: null,
  buffering: false,
  connection: "direct",
  displayName: "Host",
  driftMs: 0,
  endpointId: "end-p1",
  left: false,
  peerId: "p1",
  ready: true,
  role: "host",
  rttMs: 10,
};

const GUEST_PEER: PeerInfo = {
  avatarSeed: "g",
  anilistUserId: null,
  buffering: false,
  connection: "direct",
  displayName: "Anna",
  driftMs: 4,
  endpointId: "end-p2",
  left: false,
  peerId: "p2",
  ready: false,
  role: "viewer",
  rttMs: 12,
};

function status(role: SessionRole): SessionStatus {
  return {
    chat: [],
    hostOnline: true,
    lobbyRole: role === "host" ? "host" : "viewer",
    missing: {},
    paths: {},
    peers: [HOST_PEER, GUEST_PEER],
    plan: [],
    ready: {
      allReady: false,
      peers: [
        { peerId: "p1", ready: true },
        { peerId: "p2", ready: false },
      ],
    },
    role,
    sessionId: "a1b2c3d4e5f60718",
    yourPeerId: null,
    ticket: null,
    waiting: null,
  };
}

const SAMPLE: SyncSample = {
  awaitingRestart: false,
  correction: 1,
  driftMs: 42,
  haveSnapshot: true,
  identityOk: true,
  instruction: null,
  lag: "good",
  offsetMs: 0,
  rttMs: 88,
};

function renderPanel(overrides: {
  onOffset?: (value: number) => void;
  onResync?: () => void;
  role: SessionRole;
  sample?: SyncSample | null;
}) {
  return render(
    <LobbyPanel
      onOffset={overrides.onOffset ?? (() => undefined)}
      onResync={overrides.onResync ?? (() => undefined)}
      role={overrides.role}
      sample={overrides.sample === undefined ? SAMPLE : overrides.sample}
      status={status(overrides.role)}
    />
  );
}

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

afterEach(() => {
  cleanup();
});

describe("LobbyPanel", () => {
  it("combines the seconds and milliseconds drafts into one offset", async () => {
    const user = userEvent.setup();
    const onOffset = vi.fn();
    renderPanel({ onOffset, role: "guest" });

    await user.type(screen.getByLabelText("Offset seconds"), "-1");
    await user.type(screen.getByLabelText("Offset milliseconds"), "250");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(onOffset).toHaveBeenCalledWith(-750);
  });

  it("clamps the applied offset to the session limit", async () => {
    const user = userEvent.setup();
    const onOffset = vi.fn();
    renderPanel({ onOffset, role: "guest" });

    await user.type(screen.getByLabelText("Offset seconds"), "9999");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(onOffset).toHaveBeenCalledWith(60_000);
  });

  it("shows the current local offset", () => {
    renderPanel({ role: "guest", sample: { ...SAMPLE, offsetMs: -750 } });

    expect(screen.getByText("Current -0.750s")).toBeTruthy();
  });

  it("offers the host a resync control instead of the offset inputs", async () => {
    const user = userEvent.setup();
    const onResync = vi.fn();
    renderPanel({ onResync, role: "host" });

    expect(screen.queryByLabelText("Offset seconds")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Resync" }));

    expect(onResync).toHaveBeenCalledTimes(1);
  });

  it("renders the roster and the ready gate", () => {
    renderPanel({ role: "guest" });

    expect(screen.getByText("Peers")).toBeTruthy();
    expect(screen.getByText("Anna")).toBeTruthy();
    expect(screen.getByText("Ready 1/2")).toBeTruthy();
  });

  it("falls back to a waiting label before the first snapshot", () => {
    renderPanel({ role: "guest", sample: null });

    expect(screen.getByText("Waiting for the host")).toBeTruthy();
  });

  it("shows ping and drift once a snapshot exists", () => {
    renderPanel({ role: "guest" });

    expect(screen.getByText("88 ms ping · 42 ms drift")).toBeTruthy();
  });
});
