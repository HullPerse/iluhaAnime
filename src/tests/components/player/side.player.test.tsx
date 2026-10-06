import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PlayerSidePanel from "@/routes/components/player/side.player";
import { useSettingsStore } from "@/store/settings.store";

vi.mock("@/routes/components/player/media/playlist.player", () => ({
  default: () => <div data-testid="playlist-body" />,
}));

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

afterEach(() => {
  cleanup();
});

describe("PlayerSidePanel", () => {
  it("shows the playlist header and body", () => {
    render(
      <PlayerSidePanel
        onMove={async () => undefined}
        onPlay={async () => undefined}
        onRemove={async () => undefined}
      />
    );

    expect(screen.getByText("Playlist")).toBeTruthy();
    expect(screen.getByTestId("playlist-body")).toBeTruthy();
  });
});
