import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import MangaDetail from "@/routes/components/manga/detail.manga";
import { patchSettings } from "@/store/settings.store";

const details = vi.hoisted(() => vi.fn());
const searchManga = vi.hoisted(() => vi.fn());
vi.mock("@/api/manga.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/manga.api")>()),
  refreshMangaChapters: details,
  getMangaCachedDetails: async () => null,
  getMangaReads: async () => [],
  getMangaLibrary: async () => ({ items: [], statuses: [] }),
}));
vi.mock("@/store/manga.store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/store/manga.store")>()),
  searchLocalManga: searchManga,
}));

afterEach(() => {
  cleanup();
  details.mockReset();
  searchManga.mockReset();
  patchSettings({ mangaTranslation: {} });
});

function openDetails() {
  patchSettings({ language: "ru", modalAnimation: false, animateModalContent: false });
  const close = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MangaDetail source="mangalib" id="test" title="Test manga" nsfw={false} onClose={close} />
    </QueryClientProvider>
  );
  return { dialog: within(screen.getByRole("dialog", { name: "Test manga" })), close };
}

it("shows a dismissible loading dialog before details resolve", () => {
  details.mockImplementation(() => new Promise(() => {}));
  const { dialog, close } = openDetails();
  expect(dialog.getByRole("status").textContent).toContain("Загружаем детали манги");
  fireEvent.click(dialog.getByRole("button", { name: "Закрыть" }));
  expect(close).toHaveBeenCalledOnce();
});

it("retries a failed request and shows an empty chapter list with optional metadata absent", async () => {
  details.mockRejectedValueOnce(new Error("Unavailable")).mockResolvedValueOnce({
    title: { id: "test", title: "Test manga", cover: null, externalIds: { anilist: null, mal: 1 } },
    authors: [],
    artists: [],
    genres: [],
    release: null,
    description: null,
    chapters: [],
  });
  const { dialog } = openDetails();
  const alert = await dialog.findByRole("alert");
  expect(alert.textContent).toContain("Не удалось загрузить детали манги");
  fireEvent.click(dialog.getByRole("button", { name: "Повторить" }));
  await dialog.findByText("Главы");
  expect(dialog.queryByText("Доступных глав пока нет.")).toBeNull();
  expect(dialog.queryByText("Авторы")).toBeNull();
  expect(dialog.queryByRole("combobox", { name: "Переводы" })).toBeNull();
});

it("searches by title, author, and artist and shows a resizable description textarea", async () => {
  details.mockResolvedValueOnce({
    title: {
      id: "test",
      title: "Test manga",
      cover: null,
      externalIds: { anilist: null, mal: null },
    },
    authors: ["Author One", "Author Two"],
    artists: ["Artist One"],
    genres: [],
    release: null,
    description: "Test description",
    chapters: [],
  });
  const { dialog, close } = openDetails();
  const description = await dialog.findByRole("textbox", { name: "Описание" });
  expect(description.tagName).toBe("TEXTAREA");
  expect(description.className).toContain("resize-y");

  const author = dialog.getByRole("button", { name: "Author One" });
  expect(author.closest("dd")?.textContent).toBe("Author One,Author Two");

  fireEvent.click(dialog.getByRole("button", { name: "Test manga" }));
  expect(searchManga).toHaveBeenLastCalledWith("Test manga", undefined);
  fireEvent.click(author);
  expect(searchManga).toHaveBeenLastCalledWith("Author One", {
    name: "Author One",
    role: "author",
    source: "mangalib",
  });
  fireEvent.click(dialog.getByRole("button", { name: "Artist One" }));
  expect(searchManga).toHaveBeenLastCalledWith("Artist One", {
    name: "Artist One",
    role: "artist",
    source: "mangalib",
  });
  expect(close).toHaveBeenCalledTimes(3);
});

it("ranks translators by unique chapters and keeps missing chapters visible", async () => {
  patchSettings({ mangaTranslation: { "mangalib:test": "preferred" } });
  const chapter = (key: string, group: string, version = 1) => ({
    id: `${group}:${key}:${version}`,
    number: key,
    key,
    group,
    language: "ru",
    volume: null,
    title: null,
    locked: false,
    lockReason: null,
    availableAt: null,
    branch: null,
  });
  details.mockResolvedValueOnce({
    title: {
      id: "test",
      title: "Test manga",
      cover: null,
      externalIds: { anilist: null, mal: null },
    },
    authors: [],
    artists: [],
    genres: [],
    release: null,
    description: null,
    chapters: [
      chapter("3", "Команда Б"),
      chapter("3", "Команда Б", 2),
      chapter("3", "Команда Б", 3),
      chapter("2", "Команда А"),
      chapter("1", "Команда А"),
    ],
  });

  const { dialog } = openDetails();
  const select = await dialog.findByRole("combobox", { name: "Переводы" });
  expect(select.textContent).toContain("Команда А (2 главы)");
  const missing = dialog.getByRole("button", { name: /^Глава 3/ });
  expect(missing.getAttribute("aria-disabled")).toBe("true");
  expect(missing.closest("li")?.title).toBe("Нет перевода на эту главу");
  expect(dialog.getByText("Глава 3")).toBeTruthy();

  fireEvent.click(select);
  const options = await screen.findAllByRole("option");
  expect(options.map((option) => option.textContent)).toEqual([
    "RU - Команда А (2 главы)",
    "RU - Команда Б (1 глава)",
  ]);
  act(() => patchSettings({ mangaTranslation: { "mangalib:test": "ru:Команда Б" } }));
  expect(select.textContent).toContain("Команда Б (1 глава)");
  const missingRows = dialog.getAllByRole("button", { name: /^Глава [12]$/ });
  expect(missingRows).toHaveLength(2);
  for (const row of missingRows) expect(row.getAttribute("aria-disabled")).toBe("true");
  expect(dialog.getByRole("button", { name: /^Глава 3/ }).getAttribute("aria-disabled")).toBe(
    "false"
  );
});
