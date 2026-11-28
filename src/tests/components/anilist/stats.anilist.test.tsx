import { mockInvoke as invokeMock } from "@/tests/mocks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { anilistApi } from "@/api/anilist.api";
import StatsModal from "@/routes/components/anilist/stats.anilist";
import { patchSettings } from "@/store/settings.store";
import type { ActivityDetailBundle, AniListCollection, AniMedia } from "@/types/anilist/anilist";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

const DETAIL: ActivityDetailBundle = {
  entryLookup: new Map(),
  favouriteIds: new Set(),
  isLoggedIn: false,
  onFavouriteToggle: () => Promise.resolve(),
  onTag: () => undefined,
  onGenre: () => undefined,
};

const listsWithAiring = (): AniListCollection[] => {
  const now = new Date();
  const airingAt = Math.floor(new Date(now.getFullYear(), now.getMonth(), 15, 12).getTime() / 1000);

  return [
    {
      name: "Watching",
      entries: [
        {
          media: {
            id: 21,
            title: "Frieren",
            next_airing_at: airingAt,
            next_episode: 5,
            cover_url: null,
            genres: [],
            studios: [],
          },
        },
        {
          media: {
            id: 22,
            title: "Other Show",
            next_airing_at: airingAt,
            next_episode: 1,
            cover_url: null,
            genres: [],
            studios: [],
          },
        },
      ],
    } as unknown as AniListCollection,
  ];
};

const listsAiringToday = (): AniListCollection[] => {
  const now = new Date();
  const airingAt = Math.floor(
    new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20).getTime() / 1000
  );

  return [
    {
      name: "Watching",
      entries: [
        {
          media: {
            id: 21,
            title: "Frieren",
            next_airing_at: airingAt,
            next_episode: 5,
            cover_url: null,
            genres: [],
            studios: [],
          },
        },
      ],
    } as unknown as AniListCollection,
  ];
};

const wrapper = ({ children }: { children: ReactNode }) => {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  invokeMock.mockReset();
  patchSettings({ language: "ru", modalAnimation: false, anilistProxyUrl: null });
  invokeMock.mockImplementation((command: string) => {
    if (command === "get_anime_full") return new Promise(() => undefined);

    return Promise.reject(new Error(`unexpected command ${command}`));
  });
});

describe("StatsModal inline detail", () => {
  it("opens the calendar entry inside the same dialog and returns on back", async () => {
    const user = userEvent.setup();
    render(
      <StatsModal
        lists={listsWithAiring()}
        userId={123}
        scoreFormat="POINT_10"
        onClose={vi.fn()}
        detail={DETAIL}
      />,
      { wrapper }
    );
    expect(screen.getByText("Статистика")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Календарь" }));
    await user.click(screen.getByRole("button", { name: "Frieren" }));
    expect(await screen.findByText("Загрузка...")).toBeDefined();
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Назад" }));
    expect(await screen.findByText("Статистика")).toBeDefined();
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  });

  it("switches the calendar between the user's lists and the current season", async () => {
    const user = userEvent.setup();
    const now = new Date();
    const seasonAiringAt = Math.floor(
      new Date(now.getFullYear(), now.getMonth(), 20, 12).getTime() / 1000
    );
    vi.spyOn(anilistApi, "search").mockResolvedValue([
      {
        id: 31,
        title: "Season Show",
        next_airing_at: seasonAiringAt,
        next_episode: 3,
        cover_url: null,
      } as AniMedia,
    ]);

    render(
      <StatsModal
        lists={listsWithAiring()}
        userId={123}
        scoreFormat="POINT_10"
        onClose={vi.fn()}
        detail={DETAIL}
      />,
      { wrapper }
    );

    await user.click(screen.getByRole("button", { name: "Календарь" }));
    expect(await screen.findByRole("button", { name: "Frieren" })).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Сезон" }));
    expect(await screen.findByRole("button", { name: "Season Show" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Frieren" })).toBeNull();
    expect(anilistApi.search).toHaveBeenCalledWith(
      expect.objectContaining({ status: "RELEASING", maxPages: 1, perPage: 50 })
    );
  });

  it("shows a seven-day board for both calendar sources", async () => {
    const user = userEvent.setup();
    const now = new Date();
    const seasonAiringAt = Math.floor(
      new Date(now.getFullYear(), now.getMonth(), now.getDate(), 21).getTime() / 1000
    );
    vi.spyOn(anilistApi, "search").mockResolvedValue([
      {
        id: 31,
        title: "Season Show",
        next_airing_at: seasonAiringAt,
        next_episode: 3,
        cover_url: null,
      } as AniMedia,
    ]);

    render(
      <StatsModal
        lists={listsAiringToday()}
        userId={123}
        scoreFormat="POINT_10"
        onClose={vi.fn()}
        detail={DETAIL}
      />,
      { wrapper }
    );

    await user.click(screen.getByRole("button", { name: "Календарь" }));
    await user.click(screen.getByRole("button", { name: "Неделя" }));

    const board = await screen.findByRole("region", { name: "Ближайшая неделя" });
    expect(within(board).getAllByRole("region")).toHaveLength(7);
    expect(within(board).getByRole("button", { name: "Frieren" })).toBeDefined();
    expect(document.querySelector('[role="dialog"]')?.className).toContain("w-5xl");

    await user.click(screen.getByRole("button", { name: "Сезон" }));
    const seasonBoard = await screen.findByRole("region", { name: "Ближайшая неделя" });
    expect(await within(seasonBoard).findByRole("button", { name: "Season Show" })).toBeDefined();
    expect(within(seasonBoard).queryByRole("button", { name: "Frieren" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Месяц" }));
    expect(document.querySelector('[role="dialog"]')?.className).toContain("w-3xl");
  });

  it("moves the calendar day into the modal titlebar and returns on back", async () => {
    const user = userEvent.setup();
    render(
      <StatsModal
        lists={listsWithAiring()}
        userId={123}
        scoreFormat="POINT_10"
        onClose={vi.fn()}
        detail={DETAIL}
      />,
      { wrapper }
    );
    await user.click(screen.getByRole("button", { name: "Календарь" }));
    await user.click(await screen.findByRole("button", { name: /Релиз[a-я]* в/ }));
    expect(await screen.findByRole("heading", { name: /^15 / })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Назад" }));
    expect(await screen.findByRole("heading", { name: "Статистика" })).toBeDefined();
  });
});
