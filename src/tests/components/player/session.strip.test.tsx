import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionStrip } from "@/routes/components/player/session.strip.player";
import { useSettingsStore } from "@/store/settings.store";
import type { SessionStatus, SyncSample } from "@/types/session";

const GUEST_STATUS: SessionStatus = {
  chat: [],
  hostOnline: true,
  lobbyRole: "viewer",
  missing: {},
  paths: {},
  peers: [],
  plan: [],
  ready: { allReady: false, peers: [] },
  role: "guest",
  sessionId: "a1b2c3d4e5f60718",
  yourPeerId: null,
  ticket: null,
  waiting: null,
};

const SAMPLE: SyncSample = {
  awaitingRestart: false,
  correction: 1.02,
  driftMs: 320,
  haveSnapshot: true,
  identityOk: true,
  instruction: { kind: "setRate", rate: 1.02 },
  lag: "fair",
  offsetMs: 0,
  rttMs: 90,
};

function renderStrip(overrides: {
  hostLost?: boolean;
  onResumeAlone?: () => void;
  role: "host" | "guest";
}) {
  return render(
    <SessionStrip
      hostLost={overrides.hostLost ?? false}
      onResumeAlone={overrides.onResumeAlone ?? (() => undefined)}
      role={overrides.role}
      sample={SAMPLE}
      status={{ ...GUEST_STATUS, role: overrides.role }}
    />
  );
}

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

afterEach(() => {
  cleanup();
});

describe("SessionStrip", () => {
  it("shows the role, room size, and lag while collapsed", () => {
    renderStrip({ role: "guest" });

    expect(screen.getByText("Joined")).toBeTruthy();
    expect(screen.getByText("0 in room")).toBeTruthy();
    expect(screen.getByText("Drifting")).toBeTruthy();
  });

  it("stays a bare indicator without sync controls", () => {
    renderStrip({ role: "guest" });

    expect(screen.queryByRole("button", { name: "Sync settings" })).toBeNull();
    expect(screen.queryByLabelText("Offset seconds")).toBeNull();
  });

  it("hides the host-left banner while the host is present", () => {
    renderStrip({ role: "host" });

    expect(screen.queryByText("Host left")).toBeNull();
  });

  it("shows the host-left banner with a continue-alone action", async () => {
    const user = userEvent.setup();
    const onResumeAlone = vi.fn();
    renderStrip({ hostLost: true, onResumeAlone, role: "guest" });

    expect(screen.getByText("Host left")).toBeTruthy();
    expect(
      screen.getByText("Playback is paused while the host is away.")
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Continue alone" }));
    expect(onResumeAlone).toHaveBeenCalledTimes(1);
  });
});
