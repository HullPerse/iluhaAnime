import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PlayerSidePanel from "@/routes/components/player/side.player";
import { useSettingsStore } from "@/store/settings.store";
import type { PlayerPanelTab } from "@/types/player";
import type { SessionStatus, SyncSample } from "@/types/session";

vi.mock("@/routes/components/player/media/playlist.player", () => ({
  default: () => <div data-testid="playlist-body" />,
}));

const STATUS: SessionStatus = {
  chat: [],
  hostOnline: true,
  lobbyRole: "viewer",
  missing: {},
  paths: {},
  peers: [],
  plan: [],
  ready: { allReady: true, peers: [] },
  role: "guest",
  sessionId: "a1b2c3d4e5f60718",
  yourPeerId: null,
  ticket: null,
  waiting: null,
};

const SAMPLE: SyncSample = {
  awaitingRestart: false,
  correction: 1,
  driftMs: 10,
  haveSnapshot: true,
  identityOk: true,
  instruction: null,
  lag: "good",
  offsetMs: 0,
  rttMs: 20,
};

function renderPanel(overrides: {
  activeTab: PlayerPanelTab;
  onTabChange?: (tab: PlayerPanelTab) => void;
  role: "host" | "guest" | null;
}) {
  return render(
    <PlayerSidePanel
      activeTab={overrides.activeTab}
      onMove={async () => undefined}
      onOffset={() => undefined}
      onPlay={async () => undefined}
      onRemove={async () => undefined}
      onResync={() => undefined}
      onTabChange={overrides.onTabChange ?? (() => undefined)}
      role={overrides.role}
      sample={SAMPLE}
      status={STATUS}
    />
  );
}

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

afterEach(() => {
  cleanup();
});

describe("PlayerSidePanel", () => {
  it("shows only the playlist header when no session is running", () => {
    renderPanel({ activeTab: "playlist", role: null });

    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.getByText("Playlist")).toBeTruthy();
    expect(screen.getByTestId("playlist-body")).toBeTruthy();
  });

  it("exposes playlist and lobby tabs inside a session", () => {
    renderPanel({ activeTab: "playlist", role: "guest" });

    expect(screen.getByRole("tab", { name: "Playlist" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Lobby" })).toBeTruthy();
    expect(screen.getByTestId("playlist-body")).toBeTruthy();
  });

  it("renders the lobby panel when the lobby tab is active", () => {
    renderPanel({ activeTab: "lobby", role: "guest" });

    expect(screen.queryByTestId("playlist-body")).toBeNull();
    expect(screen.getByText("Sync settings")).toBeTruthy();
    expect(screen.getByText("Peers")).toBeTruthy();
  });

  it("requests the lobby tab when it is clicked", async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    renderPanel({ activeTab: "playlist", onTabChange, role: "guest" });

    await user.click(screen.getByRole("tab", { name: "Lobby" }));

    expect(onTabChange).toHaveBeenCalledWith("lobby");
  });
});
