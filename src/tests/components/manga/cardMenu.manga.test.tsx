import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { mockInvoke } from "@/tests/mocks";
import { MangaCardMenu } from "@/routes/components/manga/card/menu.card";
import { mangaDetail } from "@/store/manga.store";

afterEach(() => {
  cleanup();
  mangaDetail.set(null);
});

it("continues from history and toggles collection favourites through the shared menu", async () => {
  const hit = {
    id: "title",
    title: "Manga",
    cover: null,
    rating: "safe",
    suggestive: false,
    aliases: [],
    externalIds: { anilist: null, mal: null },
  };
  mockInvoke.mockImplementation(async (command) => {
    if (command === "manga_library")
      return {
        items: [
          {
            id: "copy",
            mangaId: "title",
            title: "Manga",
            source: "mangalib",
            cover: null,
            rating: "safe",
            status: "reading",
            unread: 2,
            read: 3,
            updatedAt: 0,
            lastReadAt: 1,
            favourite: false,
          },
        ],
        statuses: [{ id: "reading", label: "Читаю", color: "#ffffff" }],
      };

    if (command === "manga_history_list")
      return [
        {
          itemId: "copy",
          source: "mangalib",
          mangaId: "title",
          title: "Manga",
          chapterId: "chapter-3",
          chapterKey: "3",
          openedAt: 1,
        },
      ];

    return undefined;
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MangaCardMenu source="mangalib" hit={hit}>
        <button type="button">Manga</button>
      </MangaCardMenu>
    </QueryClientProvider>
  );
  const card = screen.getByRole("button", { name: "Manga" });
  fireEvent.contextMenu(card);
  const resume = await screen.findByRole("menuitem", { name: "Продолжить чтение" });
  await waitFor(() => expect(resume.getAttribute("aria-disabled")).not.toBe("true"));
  fireEvent.click(resume);
  expect(mangaDetail.get()).toEqual({
    source: "mangalib",
    id: "title",
    title: "Manga",
    chapterId: "chapter-3",
    chapterKey: "3",
  });
  fireEvent.contextMenu(card);
  fireEvent.click(await screen.findByRole("menuitem", { name: "Добавить в избранное" }));
  await waitFor(() =>
    expect(mockInvoke).toHaveBeenCalledWith("manga_library_favourite", {
      id: "copy",
      favourite: true,
    })
  );
});
