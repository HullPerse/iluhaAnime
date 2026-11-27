import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import StreamDetail from "@/routes/components/stream/detail.stream";
import { patchSettings } from "@/store/settings.store";
import type { StreamingAnime, StreamingEpisode } from "@/types/player/stream";

vi.mock("@/hooks/remoteImage.hook", () => ({
  useStreamCover: () => null,
  resetRemoteImageCache: () => undefined,
}));

const clipboard = vi.hoisted(() => ({ writeText: vi.fn(async () => undefined) }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => clipboard);

const ANIME: StreamingAnime = {
  id: "21371",
  title: "Sousou no Frieren",
  synonyms: [],
  genres: [],
  anilistId: 154587,
  slugUrl: "21371--sousou-no-frieren-anime",
  episodeCount: 2,
};

const EPISODES: StreamingEpisode[] = [
  { id: "1", number: 1, title: "The Journey's End" },
  { id: "2", number: 2, title: "It Didn't Have to Be Magic" },
];

vi.mock("@/hooks/stream/catalog.hook", () => ({
  useStreamTitle: () => ({
    data: { anime: ANIME, episodes: EPISODES },
    isPending: false,
    error: null,
    refetch: vi.fn(),
  }),
  useAnilistEpisodePreviews: () => new Map<number, string>(),
  useStreamHistoryForAnime: () => ({ data: [], isPending: false }),
}));

vi.mock("@/hooks/anilist/session.hook", () => ({
  useAnilistSignedIn: () => true,
}));

interface SourcesInput {
  episodeId: string;
  variantId: string;
}

interface PlayableSource {
  variantId: string;
  url: string;
  type: string;
  quality: string;
  label: string;
  headers: Record<string, string>;
}

const DEFAULT_PREFS = {
  sourceId: "animelib",
  mediaId: "21371",
  variantId: "Kodik:7",
  quality: "1080p",
  audioLang: "",
  subLang: "",
};

const DEFAULT_PLAYERS = [
  {
    id: "7",
    name: "AniDUB",
    language: "Озвучка",
    separateStream: true,
    player: "Kodik",
    sourceUrl: "",
  },
  {
    id: "8",
    name: "Other",
    language: "Озвучка",
    separateStream: true,
    player: "Kodik",
    sourceUrl: "",
  },
];

const DEFAULT_SOURCES: PlayableSource[] = [
  {
    variantId: "Kodik:7",
    url: "https://cdn/1080.mp4",
    type: "mp4",
    quality: "1080",
    label: "1080p",
    headers: {},
  },
];

const api = vi.hoisted(() => ({
  prefsGet: vi.fn(),
  prefsSave: vi.fn(),
  players: vi.fn(),
  streamSources: vi.fn(),
}));

vi.mock("@/api/stream.api", () => ({ streamApi: api }));

const playback = vi.hoisted(() => ({
  openStream: vi.fn(async () => undefined),
  loadWatch: vi.fn(async () => null),
  prewarmPlayer: vi.fn(async () => undefined),
}));

vi.mock("@/lib/player/playback.utils", () => playback);

vi.mock("@/routes/components/anilist/detail/modal.detail", () => ({
  default: ({
    animeId,
    onBack,
    onClose,
  }: {
    animeId: number;
    onBack: () => void;
    onClose: () => void;
  }) => (
    <div data-testid="anilist-detail">
      <span>AniList {animeId}</span>
      <button type="button" onClick={onBack}>
        detail back
      </button>
      <button type="button" onClick={onClose}>
        detail close
      </button>
    </div>
  ),
}));

beforeEach(() => {
  patchSettings({ language: "ru", playerPrewarmEnabled: true });
  api.prefsGet.mockReset().mockResolvedValue(DEFAULT_PREFS);
  api.prefsSave.mockReset().mockResolvedValue(undefined);
  api.players.mockReset().mockImplementation(async () => DEFAULT_PLAYERS);
  api.streamSources.mockReset().mockImplementation(async (_input: SourcesInput) => DEFAULT_SOURCES);
  playback.openStream.mockClear();
  playback.loadWatch.mockClear();
  playback.prewarmPlayer.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("StreamDetail AniList button", () => {
  it("does not duplicate the tab-owned player prewarm when opening a title", () => {
    render(<StreamDetail slug={ANIME.slugUrl} />);

    expect(playback.prewarmPlayer).not.toHaveBeenCalled();
  });

  it("leaves the player cold when prewarming is turned off", () => {
    patchSettings({ playerPrewarmEnabled: false });

    render(<StreamDetail slug={ANIME.slugUrl} />);

    expect(playback.prewarmPlayer).not.toHaveBeenCalled();
  });

  it("copies the sharing link of this title from the modal header", async () => {
    render(<StreamDetail slug={ANIME.slugUrl} />);

    fireEvent.click(screen.getByRole("button", { name: "Скопировать ссылку" }));

    await waitFor(() =>
      expect(clipboard.writeText).toHaveBeenCalledWith(
        `iluhaanime://stream/animelib/${ANIME.slugUrl}`
      )
    );
  });

  it("keeps the AniList action in the modal header next to the close button", () => {
    render(<StreamDetail slug={ANIME.slugUrl} />);

    const anilist = screen.getByRole("button", { name: "Детали в AniList" });
    const close = screen.getByRole("button", { name: "Закрыть" });

    expect(anilist.parentElement).toBe(close.parentElement);
    expect(anilist.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("opens the AniList details in the app instead of the browser", () => {
    render(<StreamDetail slug={ANIME.slugUrl} />);

    fireEvent.click(screen.getByRole("button", { name: "Детали в AniList" }));

    expect(screen.getByTestId("anilist-detail").textContent).toContain("AniList 154587");
    expect(screen.queryByText("The Journey's End")).toBeNull();
  });

  it("does not request neighbouring episode sources before playback", () => {
    render(<StreamDetail slug={ANIME.slugUrl} />);

    expect(api.players).not.toHaveBeenCalled();
    expect(api.streamSources).not.toHaveBeenCalled();
    expect(playback.openStream).not.toHaveBeenCalled();
  });

  it("does not open a late stream result after the title modal closes", async () => {
    let finish: ((sources: PlayableSource[]) => void) | undefined;
    api.streamSources.mockImplementationOnce(
      () =>
        new Promise<PlayableSource[]>((resolve) => {
          finish = resolve;
        })
    );
    const { unmount } = render(<StreamDetail slug={ANIME.slugUrl} />);
    fireEvent.click(screen.getByText("The Journey's End"));
    await waitFor(() => expect(api.streamSources).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => {
      finish?.(DEFAULT_SOURCES);
    });
    expect(playback.openStream).not.toHaveBeenCalled();
  });

  it("plays the remembered voice-over without asking for another one", async () => {
    render(<StreamDetail slug={ANIME.slugUrl} />);

    fireEvent.click(await screen.findByText("The Journey's End"));

    await waitFor(() => expect(playback.openStream).toHaveBeenCalledTimes(1));
    expect(new Set(api.streamSources.mock.calls.map(([input]) => input.variantId))).toEqual(
      new Set(["Kodik:7"])
    );
    expect(playback.openStream).toHaveBeenCalledWith(
      expect.objectContaining({ mediaUrl: "https://cdn/1080.mp4", variantId: "Kodik:7" })
    );
  });

  it("falls back to the picked row when the remembered voice-over is gone", async () => {
    api.prefsGet.mockResolvedValue({
      sourceId: "animelib",
      mediaId: "21371",
      variantId: "Kodik:99",
      quality: "1080p",
      audioLang: "",
      subLang: "",
    });
    api.streamSources.mockImplementation(async ({ variantId }) => [
      {
        variantId,
        url: `https://cdn/${variantId.replace(":", "-")}.mp4`,
        type: "mp4",
        quality: "1080",
        label: "1080p",
        headers: {},
      },
    ]);
    render(<StreamDetail slug={ANIME.slugUrl} />);

    fireEvent.click(await screen.findByText("The Journey's End"));

    await waitFor(() => expect(playback.openStream).toHaveBeenCalledTimes(1));
    expect(api.streamSources.mock.calls.at(-1)?.[0].variantId).toBe("Kodik:7");
    expect(playback.openStream).toHaveBeenCalledWith(
      expect.objectContaining({ mediaUrl: "https://cdn/Kodik-7.mp4" })
    );
  });

  it("returns to the episode list from the AniList details", () => {
    render(<StreamDetail slug={ANIME.slugUrl} />);

    fireEvent.click(screen.getByRole("button", { name: "Детали в AniList" }));
    fireEvent.click(screen.getByRole("button", { name: "detail back" }));

    expect(screen.queryByTestId("anilist-detail")).toBeNull();
    expect(screen.getByText("The Journey's End")).toBeDefined();
  });
});
