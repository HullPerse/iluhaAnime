import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PlayerSidePanel from "@/routes/components/player/side.player";
import { streamSession } from "@/store/player.store";
import { patchSettings } from "@/store/settings.store";
import type { StreamingEpisode } from "@/types/player/stream";
import type { StreamOpen } from "@/types/player/videoPlayer";

const playlistBodyProps = vi.hoisted(() => ({
  current: null as { focusedIndex?: number | null } | null,
}));

const streamNext = vi.hoisted(() => ({
  goTo: vi.fn(async () => undefined),
  goNext: vi.fn(async () => undefined),
  current: {
    hasNext: true,
    episodes: [] as StreamingEpisode[],
    episodesLoading: false,
  },
}));

vi.mock("@/hooks/stream/catalog.hook", () => ({
  useAnilistEpisodePreviews: () => new Map<number, string>(),
}));

vi.mock("@/hooks/player/stream.hook", () => ({
  useStreamNext: () => ({
    ...streamNext.current,
    goTo: streamNext.goTo,
    goNext: streamNext.goNext,
  }),
  usePlayerStream: () => ({}),
}));

vi.mock("@/routes/components/player/media/playlist.player", () => ({
  default: (props: { focusedIndex?: number | null }) => {
    playlistBodyProps.current = props;
    return <div data-testid="playlist-body" />;
  },
}));

const EPISODES: StreamingEpisode[] = [
  { id: "10", number: 1, title: "The journey" },
  { id: "11", number: 2, title: "Magic" },
  { id: "12", number: 3 },
];

const streamSessionValue = (): StreamOpen => {
  return {
    sourceId: "animelib",
    sourceName: "AnimeLib",
    mediaId: "1",
    mediaTitle: "Frieren",
    episodeId: "11",
    episodeNumber: 2,
    episodeTitle: "Magic",
    cover: "https://cover.imglib.info/frieren.jpg",
    watchKey: "stream:animelib:1:11",
    headers: {},
    quality: "1080p",
    variantId: "Animelib:9",
    sources: [],
    mediaUrl: "https://cdn/1080.mp4",
  };
};

beforeEach(() => {
  patchSettings({ language: "en" });
  streamNext.current = { hasNext: true, episodes: EPISODES, episodesLoading: false };
  streamNext.goTo.mockClear();
});

afterEach(() => {
  cleanup();
  streamSession.set(null);
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

  it("lists the season instead of the playlist for a stream session", () => {
    streamSession.set(streamSessionValue());

    render(
      <PlayerSidePanel
        onMove={async () => undefined}
        onPlay={async () => undefined}
        onRemove={async () => undefined}
      />
    );

    expect(screen.getByText("Episodes")).toBeTruthy();
    expect(screen.queryByTestId("playlist-body")).toBeNull();
    expect(screen.getByText("1. The journey")).toBeTruthy();
    expect(screen.getByText("Episode 3")).toBeTruthy();
  });

  it("opens a stream episode picked from the season", () => {
    streamSession.set(streamSessionValue());

    render(
      <PlayerSidePanel
        onMove={async () => undefined}
        onPlay={async () => undefined}
        onRemove={async () => undefined}
      />
    );

    screen.getByText("1. The journey").click();

    expect(streamNext.goTo).toHaveBeenCalledWith(EPISODES[0]);
  });
});
