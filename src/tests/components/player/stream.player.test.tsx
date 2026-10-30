import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayerStream } from "@/hooks/player/stream.hook";
import StreamControl from "@/routes/components/player/media/stream.player";
import { playbackAtoms } from "@/store/player.store";
import { patchSettings } from "@/store/settings.store";
import type { StreamVariant } from "@/types/stream";
import type { StreamOpen } from "@/types/videoPlayer";

const cache = vi.hoisted(() => ({ loadSources: vi.fn(async () => []) }));

vi.mock("@/lib/sessionCache.utils", () => ({ loadSources: cache.loadSources }));

const state = vi.hoisted(() => ({
  session: null as StreamOpen | null,
  variants: [] as StreamVariant[],
  switching: false,
  variantsLoading: false,
  variantsFailed: false,
  switchQuality: vi.fn(async () => true),
  switchVariant: vi.fn(async () => true),
  reloadVariants: vi.fn(),
}));

function playerStream(): PlayerStream {
  return {
    session: state.session,
    variants: state.variants,
    variantsLoading: state.variantsLoading,
    variantsFailed: state.variantsFailed,
    switching: state.switching,
    switchQuality: state.switchQuality,
    switchVariant: state.switchVariant,
    reloadVariants: state.reloadVariants,
  };
}

const VOICE: StreamVariant = {
  id: "1",
  name: "AniDUB",
  language: "Озвучка",
  separateStream: true,
  player: "Animelib",
  sourceUrl: "",
};

const OTHER_VOICE: StreamVariant = {
  id: "9",
  name: "Other",
  language: "Озвучка",
  separateStream: true,
  player: "Kodik",
  sourceUrl: "",
};

const SUBTITLE: StreamVariant = {
  id: "2",
  name: "Crunchyroll",
  language: "Субтитры",
  separateStream: true,
  player: "Kodik",
  sourceUrl: "",
};

function session(patch: Partial<StreamOpen> = {}): StreamOpen {
  return {
    sourceId: "animelib",
    sourceName: "AnimeLib",
    mediaId: "1",
    mediaTitle: "Frieren",
    episodeId: "10",
    episodeNumber: 1,
    episodeTitle: "The journey",
    watchKey: "stream:animelib:1:10",
    headers: {},
    quality: "1080p",
    variantId: "Animelib:1",
    sources: [
      { url: "https://cdn/1080.mp4", type: "mp4", quality: "1080", label: "1080p" },
      { url: "https://cdn/720.mp4", type: "mp4", quality: "720", label: "720p" },
    ],
    mediaUrl: "https://cdn/1080.mp4",
    ...patch,
  };
}

beforeEach(() => {
  patchSettings({ language: "en" });
  state.session = session();
  state.variants = [VOICE, SUBTITLE, OTHER_VOICE];
  state.switching = false;
  state.variantsLoading = false;
  state.variantsFailed = false;
  state.switchQuality.mockClear();
  state.switchVariant.mockClear();
  state.reloadVariants.mockClear();
  cache.loadSources.mockClear();
  playbackAtoms.videoWidth.set(1920);
  playbackAtoms.videoHeight.set(1080);
  playbackAtoms.fpsRender.set(23.976);
  playbackAtoms.dropCount.set(4);
  playbackAtoms.cacheDuration.set(12);
  playbackAtoms.cacheBufferingState.set(undefined);
  playbackAtoms.pausedForCache.set(undefined);
});

afterEach(() => {
  cleanup();
});

describe("StreamControl", () => {
  it("renders the active voice-over and keeps the subtitle select at None", () => {
    render(<StreamControl stream={playerStream()} />);

    expect(screen.getByRole("button", { name: "Voice-over: AniDUB" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Subs: None" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Quality: 1080p" })).toBeTruthy();
  });

  it("moves the active row to the subtitle select", () => {
    state.session = session({ variantId: "Kodik:2" });
    render(<StreamControl stream={playerStream()} />);

    expect(screen.getByRole("button", { name: "Voice-over: None" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Subs: Crunchyroll" })).toBeTruthy();
  });

  it("switches the voice-over from the menu", async () => {
    render(<StreamControl stream={playerStream()} />);

    fireEvent.click(screen.getByRole("button", { name: "Voice-over: AniDUB" }));
    fireEvent.click(screen.getByRole("option", { name: /Other/ }));

    expect(await screen.findByRole("button", { name: "Voice-over: Other" })).toBeTruthy();
    expect(state.switchVariant).toHaveBeenCalledWith(OTHER_VOICE);
  });

  it("warms a voice-over while the pointer is still over the option", () => {
    render(<StreamControl stream={playerStream()} />);

    fireEvent.click(screen.getByRole("button", { name: "Voice-over: AniDUB" }));
    fireEvent.pointerEnter(screen.getByRole("option", { name: /Other/ }));

    expect(cache.loadSources).toHaveBeenCalledWith("10", "Kodik:9");
  });

  it("switches quality from the source list", async () => {
    render(<StreamControl stream={playerStream()} />);

    fireEvent.click(screen.getByRole("button", { name: "Quality: 1080p" }));
    fireEvent.click(screen.getByRole("option", { name: "720p" }));

    expect(await screen.findByRole("button", { name: "Quality: 720p" })).toBeTruthy();
    expect(state.switchQuality).toHaveBeenCalledWith("720p");
  });

  it("opens the stream stats only through its own button", () => {
    render(<StreamControl stream={playerStream()} />);
    expect(screen.queryByText("1920x1080")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Stream stats" }));

    expect(screen.getByText("Resolution")).toBeTruthy();
    expect(screen.getByText("1920x1080")).toBeTruthy();
    expect(screen.getByText("23.98")).toBeTruthy();
    expect(screen.getByText("0:12")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
  });

  it("keeps one status slot so a buffering blip cannot move the controls", () => {
    const { rerender } = render(<StreamControl stream={playerStream()} />);
    const idle = screen.getByTestId("stream-status");
    expect(idle.textContent).toBe("");

    playbackAtoms.pausedForCache.set(true);
    rerender(<StreamControl stream={playerStream()} />);

    const buffering = screen.getByTestId("stream-status");
    expect(buffering).toBe(idle);
    expect(buffering.textContent).toContain("Buffering");
    expect(buffering.className).toContain("w-24");
  });

  it("renders nothing without a stream session", () => {
    state.session = null;
    const { container } = render(<StreamControl stream={playerStream()} />);
    expect(container.innerHTML).toBe("");
  });
});
