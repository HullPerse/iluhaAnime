import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { LibraryCopy } from "@/api/manga.api";
import { MangaCard } from "@/routes/components/manga/card/tile.card";

afterEach(cleanup);

it("shows the library favourite and fills completed progress", () => {
  const entry: LibraryCopy = {
    id: "item",
    source: "mangadex",
    mangaId: "source-item",
    title: "Sample",
    cover: null,
    rating: "safe",
    status: "completed",
    favourite: true,
    unread: 7,
    read: 3,
    updatedAt: 0,
    lastReadAt: null,
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MangaCard
        title={entry.title}
        cover={null}
        entry={entry}
        showUnread
        showFavourite
        onOpen={vi.fn()}
      />
    </QueryClientProvider>
  );

  expect(screen.queryByTitle("Непрочитанных глав: 7")).toBeNull();
  const progress = screen.getByRole("progressbar", { name: "Прочитано полностью" });
  expect(progress.getAttribute("aria-valuenow")).toBe("10");
  expect(progress.getAttribute("aria-valuemax")).toBe("10");
});

it("keeps source status labels and omits unknown counts", () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MangaCard title="Sample" cover={null} publicationStatus="Приостановлен" onOpen={vi.fn()} />
    </QueryClientProvider>
  );

  expect(screen.queryByTitle(/Всего глав/)).toBeNull();
});
