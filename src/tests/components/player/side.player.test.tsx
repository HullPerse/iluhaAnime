import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PlayerSidePanel from "@/routes/components/player/side.player";
import { patchSettings } from "@/store/settings.store";

const playlistBodyProps = vi.hoisted(() => ({
  current: null as { focusedIndex?: number | null } | null,
}));

vi.mock("@/routes/components/player/media/playlist.player", () => ({
  default: (props: { focusedIndex?: number | null }) => {
    playlistBodyProps.current = props;
    return <div data-testid="playlist-body" />;
  },
}));

beforeEach(() => {
  patchSettings({ language: "en" });
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

  it("passes the focus ring row down to the playlist body", () => {
    render(
      <PlayerSidePanel
        onMove={async () => undefined}
        onPlay={async () => undefined}
        onRemove={async () => undefined}
        focusedIndex={3}
      />
    );

    expect(playlistBodyProps.current?.focusedIndex).toBe(3);
  });
});
