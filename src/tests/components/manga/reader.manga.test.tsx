import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Profiler } from "react";
import { afterEach, expect, it, vi } from "vitest";

import MangaReader from "@/routes/components/manga/reader/view.reader";

const fetchPage = vi.hoisted(() => vi.fn(async () => new Blob(["page"])));
vi.mock("@/api/manga.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/manga.api")>()),
  openMangaChapter: async () => ({ key: "manifest", count: 3 }),
  fetchMangaPage: fetchPage,
}));
vi.mock("@/hooks/manga/reader/progress.hook", () => ({
  useReaderProgress: () => ({ ready: true, failed: false, save() {} }),
}));

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  vi.restoreAllMocks();
});

it("preserves the loaded page and its object URL while toggling reader settings", async () => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = true;
    },
  });
  const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:page");
  const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  const client = new QueryClient();
  const navigate = vi.fn();
  const commit = vi.fn();
  const reader = render(
    <Profiler id="manga-reader" onRender={commit}>
      <QueryClientProvider client={client}>
        <MangaReader
          chapter={{
            source: "mangalib",
            mangaId: "title",
            chapterId: "chapter",
            number: "1",
            volume: null,
            branch: null,
          }}
          title="Test manga"
          onHistory={navigate}
          hit={{
            id: "title",
            title: "Test manga",
            cover: null,
            suggestive: false,
            rating: "",
            aliases: [],
            externalIds: { anilist: null, mal: null },
          }}
          chapters={[]}
          onJump={vi.fn()}
          chapterKey="1"
          previousKeys={[]}
          previous={undefined}
          next={undefined}
          nextChapter={undefined}
          onClose={vi.fn()}
        />
      </QueryClientProvider>
    </Profiler>
  );
  const page = await screen.findByRole("img", { name: "Страница 1" });
  const settings = screen.getByRole("button", { name: "Настройки" });
  commit.mockClear();
  fireEvent.click(settings);
  expect(settings.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByRole("img", { name: "Страница 1" })).toBe(page);
  fireEvent.click(settings);
  expect(settings.getAttribute("aria-expanded")).toBe("false");
  expect(screen.getByRole("img", { name: "Страница 1" })).toBe(page);
  expect(createUrl).toHaveBeenCalledTimes(1);
  expect(revokeUrl).not.toHaveBeenCalled();
  expect(commit.mock.calls.map(([, phase]) => phase)).toEqual([
    "update",
    "nested-update",
    "update",
  ]);
  const dialog = screen.getByRole("dialog");
  fireEvent.mouseDown(dialog, { button: 3 });
  expect(navigate).not.toHaveBeenCalled();
  fireEvent.mouseUp(dialog, { button: 3 });
  fireEvent.keyDown(dialog, { code: "ArrowRight", key: "ArrowRight", shiftKey: true });
  expect(navigate.mock.calls).toEqual([[-1], [1]]);
  reader.unmount();
  expect(revokeUrl).toHaveBeenCalledExactlyOnceWith("blob:page");
});
