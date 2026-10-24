import { mockInvoke as invokeMock } from "../../mocks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import StatsModal from "@/routes/components/anilist/stats.anilist";
import { patchSettings } from "@/store/settings.store";
import type { ActivityDetailBundle, AniListCollection } from "@/types/anilist";

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

function listsWithAiring(): AniListCollection[] {
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
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  invokeMock.mockReset();
  patchSettings({ language: "en", modalAnimation: false, anilistProxyUrl: null });
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
    expect(screen.getByText("Statistics")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Calendar" }));
    await user.click(screen.getByRole("button", { name: "Frieren" }));
    expect(await screen.findByText("Loading...")).toBeDefined();
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("Statistics")).toBeDefined();
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
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
    await user.click(screen.getByRole("button", { name: "Calendar" }));
    await user.click(await screen.findByRole("button", { name: /releases on/ }));
    expect(await screen.findByRole("heading", { name: /^15 / })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("heading", { name: "Statistics" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });
});
