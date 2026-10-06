import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { anilistApi } from "@/api/anilist.api";
import { resetTransportInflight } from "@/api/transport.api";
import type { AniMedia } from "@/types/anilist";
import ChatLobby from "@/routes/components/lobby/chat.lobby";
import { useSettingsStore } from "@/store/settings.store";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `http://asset.localhost/${path}`,
  invoke: (command: string, args?: Record<string, unknown>) =>
    invokeMock(command, args),
}));

function media(overrides: Partial<AniMedia> = {}): AniMedia {
  return {
    banner_image: null,
    cover_url: null,
    description: null,
    duration: null,
    end_date: null,
    episodes: 24,
    favourites: null,
    format: "TV",
    genres: [],
    id: 21,
    id_mal: null,
    next_airing_at: null,
    next_episode: null,
    popularity: null,
    rankings: [],
    relations: [],
    score: 87,
    season: null,
    season_year: 1999,
    start_date: null,
    status: "FINISHED",
    studios: [],
    tags: [],
    title: "Flat Fallback",
    title_english: "One Piece",
    title_native: "ワンピース",
    title_romaji: "Wan Pisu",
    titles: [],
    trailer_youtube_id: null,
    ...overrides,
  };
}

let client: QueryClient;

/** Stateful harness so a pick actually rewrites the controlled draft. */
function Harness({
  onSend,
  initialDraft,
}: {
  onSend: (animeId: number | null) => void;
  initialDraft: string;
}) {
  const [draft, setDraft] = useState(initialDraft);
  return (
    <QueryClientProvider client={client}>
      <ChatLobby
        canAttach={false}
        canPin={false}
        draft={draft}
        messages={[]}
        mentionNames={["Alice"]}
        onAttach={() => undefined}
        onDownloadAttachment={() => undefined}
        onDraftChange={setDraft}
        onSend={onSend}
        onTorrentLink={() => undefined}
        pending={false}
      />
    </QueryClientProvider>
  );
}

function renderAnime(initialDraft: string, onSend = vi.fn()) {
  render(<Harness initialDraft={initialDraft} onSend={onSend} />);
  return { onSend };
}

beforeEach(() => {
  useSettingsStore.setState({
    anilistTitleLanguage: "english",
    chatImagePreviews: true,
    language: "en",
  });
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
  resetTransportInflight();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("@anime: mention", () => {
  it("opens the AniList dropdown for a spaced query", async () => {
    vi.spyOn(anilistApi, "search").mockResolvedValue([media()]);
    renderAnime("@anime:one piece");

    const option = await screen.findByRole(
      "option",
      { name: /One Piece/ },
      { timeout: 3000 }
    );
    expect(option).toBeTruthy();
    expect(screen.getByLabelText("Anime suggestions")).toBeTruthy();
  });

  it("keeps the roster menu for a plain mention", () => {
    vi.spyOn(anilistApi, "search").mockResolvedValue([media()]);
    renderAnime("hi @A");

    expect(screen.getByRole("menu", { name: "Mention suggestions" })).toBeTruthy();
    expect(screen.queryByLabelText("Anime suggestions")).toBeNull();
  });

  it("inserts the title, shows the preview bar, and sends the link anchor", async () => {
    vi.spyOn(anilistApi, "search").mockResolvedValue([media()]);
    const { onSend } = renderAnime("@anime:one");

    const option = await screen.findByRole(
      "option",
      { name: /One Piece/ },
      { timeout: 3000 }
    );
    fireEvent.click(option);

    expect(screen.getByText("Selected anime")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(onSend).toHaveBeenCalledWith(21);
  });

  it("drops the binding when the draft is edited after a pick", async () => {
    vi.spyOn(anilistApi, "search").mockResolvedValue([media()]);
    renderAnime("@anime:one");

    const option = await screen.findByRole(
      "option",
      { name: /One Piece/ },
      { timeout: 3000 }
    );
    fireEvent.click(option);
    expect(screen.getByText("Selected anime")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Message the room"), {
      target: { value: "changed my mind" },
    });

    expect(screen.queryByText("Selected anime")).toBeNull();
  });

  it("sends a plain line without a pick", async () => {
    const { onSend } = renderAnime("just talking");

    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(onSend).toHaveBeenCalledWith(null);
  });
});
