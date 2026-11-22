import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { Profiler } from "react";
import { afterEach, expect, it, vi } from "vitest";

import MangaSearch from "@/routes/components/manga/search/view.search";
import { mangaQuery, mangaSearchSource } from "@/store/manga.store";

const metadata = vi.hoisted(() => vi.fn());
vi.mock("@/api/manga.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/manga.api")>()),
  getMangaLibrary: async () => ({ items: [], statuses: [] }),
  getMangaSources: async () => [{ id: "mangalib", enabled: true }],
  getMangaSearchMeta: metadata,
  searchManga: async () => ({
    items: [
      {
        id: "one",
        title: "Sample manga",
        cover: null,
        status: "ongoing",
        rating: "safe",
      },
    ],
    hasNext: false,
  }),
}));

const initialQuery = mangaQuery.get();
const initialSource = mangaSearchSource.get();
afterEach(() => {
  cleanup();
  mangaQuery.set(initialQuery);
  mangaSearchSource.set(initialSource);
  metadata.mockReset();
});

it("updates a result in place when its chapter total arrives", async () => {
  mangaQuery.set("Sample");
  mangaSearchSource.set(null);
  const chapters = Promise.withResolvers<{ id: string; chapters: number }[]>();
  metadata.mockReturnValue(chapters.promise);
  const commit = vi.fn();
  render(
    <Profiler id="manga-search" onRender={commit}>
      <QueryClientProvider client={new QueryClient()}>
        <MangaSearch />
      </QueryClientProvider>
    </Profiler>
  );
  const catalog = within(await screen.findByRole("region", { name: "MangaLib" }));
  const card = await catalog.findByRole("button", { name: "Sample manga" });
  expect(catalog.getByText("Продолжается")).toBeTruthy();
  expect(catalog.queryByTitle("Всего глав: 313")).toBeNull();

  commit.mockClear();
  await act(async () => chapters.resolve([{ id: "one", chapters: 313 }]));

  const count = await catalog.findByTitle("Всего глав: 313");
  expect(count.textContent).toBe("313 гл.");
  expect(catalog.getByRole("button", { name: "Sample manga" })).toBe(card);
  expect(commit.mock.calls.map(([, phase]) => phase)).toEqual(["update"]);
});
