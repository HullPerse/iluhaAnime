import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, expect, it, vi } from "vitest";

import MangaHistory from "@/routes/components/manga/history/view.history";

const cover = vi.hoisted(() => ({ render: vi.fn(), mount: vi.fn(), unmount: vi.fn() }));

vi.mock("@/api/manga.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/manga.api")>()),
  getMangaHistory: async () => [
    {
      itemId: "one",
      mangaId: "one",
      source: "mangalib",
      title: "Test manga",
      chapterKey: "1",
      chapterId: "one",
      openedAt: 1_700_000_000_000,
    },
  ],
}));

vi.mock("@/routes/components/manga/cover.manga", () => ({
  MangaCover() {
    cover.render();
    useEffect(() => {
      cover.mount();

      return () => cover.unmount();
    }, []);

    return null;
  },
}));

afterEach(cleanup);

it("keeps the matching history row mounted while typing and remounts it after clearing a filter", async () => {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <MangaHistory />
    </QueryClientProvider>
  );
  const row = await screen.findByRole("button", { name: /Test manga/ });
  const input = screen.getByRole("searchbox");
  expect(cover.render).toHaveBeenCalledTimes(1);
  expect(cover.mount).toHaveBeenCalledTimes(1);

  fireEvent.change(input, { target: { value: "test" } });
  expect(screen.getByRole("button", { name: /Test manga/ })).toBe(row);
  expect(cover.render).toHaveBeenCalledTimes(2);
  expect(cover.mount).toHaveBeenCalledTimes(1);
  expect(cover.unmount).toHaveBeenCalledTimes(0);

  fireEvent.change(input, { target: { value: "absent" } });
  expect(screen.queryByRole("button", { name: /Test manga/ })).toBeNull();
  expect(cover.unmount).toHaveBeenCalledTimes(1);

  fireEvent.change(input, { target: { value: "" } });
  expect(screen.getByRole("button", { name: /Test manga/ })).not.toBe(row);
  expect(cover.render).toHaveBeenCalledTimes(3);
  expect(cover.mount).toHaveBeenCalledTimes(2);
});
