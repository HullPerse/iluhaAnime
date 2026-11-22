import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import { Profiler } from "react";
import { afterEach, expect, it, vi } from "vitest";

import MangaLibrary from "@/routes/components/manga/library/view.library";
import { librarySort } from "@/store/manga.store";
import { patchSettings, settingsAtoms } from "@/store/settings.store";

vi.mock("@/api/manga.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/manga.api")>()),
  getMangaLibrary: async () => ({
    items: ["Alpha", "Omega"].map((title, index) => ({
      id: title,
      mangaId: title,
      title,
      source: "mangadex",
      cover: null,
      rating: "safe",
      status: "reading",
      unread: 0,
      read: 0,
      updatedAt: index,
      lastReadAt: index,
    })),
    statuses: [],
  }),
}));

const initialSort = librarySort.get();
const initialView = settingsAtoms.mangaLibraryView.get();
afterEach(() => {
  cleanup();
  librarySort.set(initialSort);
  patchSettings({ mangaLibraryView: initialView });
});

it("reorders the existing cards when the library sort changes", async () => {
  patchSettings({ mangaLibraryView: "cards" });
  librarySort.set({ key: "lastRead", dir: "desc" });
  const commit = vi.fn();
  render(
    <Profiler id="manga-library" onRender={commit}>
      <QueryClientProvider client={new QueryClient()}>
        <MangaLibrary />
      </QueryClientProvider>
    </Profiler>
  );
  const alpha = await screen.findByRole("button", { name: "Alpha" });
  const omega = screen.getByRole("button", { name: "Omega" });
  expect(screen.getAllByRole("button", { name: /Alpha|Omega/ })).toEqual([omega, alpha]);

  commit.mockClear();
  act(() => librarySort.set({ key: "title", dir: "asc" }));

  expect(screen.getAllByRole("button", { name: /Alpha|Omega/ })).toEqual([alpha, omega]);
  expect(commit.mock.calls.map(([, phase]) => phase)).toEqual(["update", "update"]);
});
