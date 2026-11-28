import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { anilistApi } from "@/api/anilist.api";
import { AiringTab } from "@/routes/components/anilist/activity/airingTab.activity";
import { patchSettings } from "@/store/settings.store";
import type { AniMedia } from "@/types/anilist/anilist";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })}
  >
    {children}
  </QueryClientProvider>
);

const seasonShow = (id: number, airingAt: number): AniMedia =>
  ({
    id,
    title: `Season ${id}`,
    next_airing_at: airingAt,
    next_episode: 1,
    cover_url: null,
  }) as AniMedia;

beforeEach(() => {
  patchSettings({
    language: "ru",
    anilistAdultContent: false,
    anilistProxyUrl: null,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AiringTab season calendar", () => {
  it("loads the next season page only when requested", async () => {
    const user = userEvent.setup();
    const airingAt = Math.floor(Date.now() / 1000) + 3600;
    const filterPage = vi
      .spyOn(anilistApi, "filterPage")
      .mockResolvedValueOnce({
        media: Array.from({ length: 50 }, (_, index) => seasonShow(100 + index, airingAt)),
        total: 51,
      })
      .mockResolvedValueOnce({ media: [seasonShow(150, airingAt)], total: 51 });

    render(<AiringTab lists={[]} onAnimeClick={vi.fn()} />, { wrapper });

    await user.click(screen.getByRole("button", { name: "Сезон" }));
    expect(await screen.findByRole("button", { name: "Season 100" })).toBeDefined();
    expect(filterPage).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, perPage: 50, status: "RELEASING" })
    );

    await user.click(screen.getByRole("button", { name: "Загрузить еще" }));

    expect(await screen.findByRole("button", { name: "Season 150" })).toBeDefined();
    expect(filterPage).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, perPage: 50 }));
  });
});
