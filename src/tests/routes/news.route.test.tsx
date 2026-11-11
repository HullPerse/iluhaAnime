import {
  mockDialogSave,
  mockInvoke,
  mockOpenUrl,
  mockWriteImage,
  mockWriteText,
} from "@/tests/mocks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import NewsRoute from "@/routes/news.route";
import { consumeNewsDeepLink, openNewsDeepLink } from "@/store/deeplink.store";
import { patchSettings } from "@/store/settings.store";
import type { UserImageFile } from "@/types/core/userimage";
import type { NewsItem, NewsPage } from "@/types/news/news";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

const first: NewsItem = {
  id: 101,
  title: "Звёздный поток бежит навстречу лету",
  createdAt: "2026-11-01T10:00:00+03:00",
  siteUrl: "https://shikimori.io/topic/101",
  blocks: [
    {
      kind: "paragraph",
      runs: [
        { text: "Звёздный поток бежит навстречу лету и " },
        { text: "ссылке", href: "https://shikimori.io/animes/z1" },
      ],
    },
  ],
  attachments: [
    {
      kind: "image",
      previewUrl: "https://shikimori.io/a/preview.jpg",
      fullUrl: "https://shikimori.io/a/full.jpg",
    },
    {
      kind: "vk",
      previewUrl: "https://shikimori.io/a/vk.jpg",
      embedUrl: "https://vkvideo.ru/video_ext.php?oid=-1&id=2&hash=abc",
      pageUrl: "https://vkvideo.ru/video-1_2",
    },
  ],
};

const withYoutube: NewsItem = {
  id: 102,
  title: "Трейлер сезона",
  createdAt: "2026-11-02T10:00:00+03:00",
  siteUrl: "https://shikimori.io/topic/102",
  blocks: [{ kind: "paragraph", runs: [{ text: "Текст под трейлером" }] }],
  attachments: [
    {
      kind: "youtube",
      previewUrl: "https://i.ytimg.com/vi/abc123def45/hqdefault.jpg",
      embedUrl: "https://www.youtube-nocookie.com/embed/abc123def45",
      pageUrl: "https://www.youtube.com/watch?v=abc123def45",
    },
  ],
};

const pageOf = (items: NewsItem[], page: number, hasMore: boolean): NewsPage => ({
  items,
  page,
  hasMore,
});

const pages: Record<number, NewsPage> = {
  1: pageOf([first, withYoutube], 1, false),
};

const renderRoute = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NewsRoute />
    </QueryClientProvider>
  );
};

const openReader = async (title: string) => {
  await userEvent.click(await screen.findByRole("button", { name: title }));
  return screen.getByRole("dialog");
};

const CACHED_IMAGE_PATH = "C:/cache/images/remote_images/a1b164675a47232e556f.webp";

const openImageMenu = (): Element => {
  const trigger = screen.getByRole("dialog").querySelector("div.contents");
  if (!trigger) throw new Error("image context menu trigger missing");
  return trigger;
};

const cachedImage = (): UserImageFile => ({
  id: "a1b164675a47232e556f",
  name: "remote-image",
  mimeType: "image/webp",
  path: CACHED_IMAGE_PATH,
  originalPath: null,
  version: null,
  createdAt: 0,
  source: "remote",
});

const mockImageCommands = (): void => {
  mockInvoke.mockImplementation((command: string, args?: Record<string, unknown>) => {
    if (command === "news_feed") {
      const page = pages[Number(args?.page ?? 1)];
      return page === undefined
        ? Promise.reject(new Error("unreachable: no such page"))
        : Promise.resolve(page);
    }
    if (command === "fetch_remote_image") return Promise.resolve(cachedImage());
    if (command === "save_cached_image") return Promise.resolve("C:/out/full.webp");
    return Promise.reject(new Error(`unexpected ${command}`));
  });
};

beforeEach(() => {
  consumeNewsDeepLink();
  mockInvoke.mockImplementation((command: string, args?: Record<string, unknown>) => {
    if (command !== "news_feed") return Promise.reject(new Error(`unexpected ${command}`));
    const page = pages[Number(args?.page ?? 1)];
    return page === undefined
      ? Promise.reject(new Error("unreachable: no such page"))
      : Promise.resolve(page);
  });
  patchSettings({ language: "en", newsTabEnabled: true, newsProxyUrl: "" });
});

describe("news route", () => {
  it("renders the feed page returned by the backend", async () => {
    renderRoute();

    expect(await screen.findByRole("button", { name: first.title })).toBeTruthy();
    expect(screen.getByRole("button", { name: withYoutube.title })).toBeTruthy();
    expect(screen.getAllByText("Page 1").length).toBeGreaterThan(0);
    expect(mockInvoke).toHaveBeenCalledWith("news_feed", { page: 1 });
  });

  it("shows the typed error and retries", async () => {
    mockInvoke.mockImplementation(() => Promise.reject(new Error("blocked: 429")));
    renderRoute();

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/Shikimori blocked the request/)).toBeTruthy();
    const before = mockInvoke.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(mockInvoke.mock.calls.length).toBeGreaterThan(before));
  });

  it("opens the reader inside the app instead of the browser", async () => {
    renderRoute();

    const dialog = await openReader(first.title);

    expect(within(dialog).getAllByText(/Звёздный поток бежит навстречу/).length).toBeGreaterThan(0);
    expect(mockOpenUrl).not.toHaveBeenCalled();
  });

  it("opens an image from the reader in the image viewer", async () => {
    renderRoute();

    const dialog = await openReader(first.title);
    await userEvent.click(within(dialog).getAllByRole("button", { name: "Open image" })[0]);

    expect(document.querySelector('img[src="https://shikimori.io/a/full.jpg"]')).not.toBeNull();
    expect(mockOpenUrl).not.toHaveBeenCalled();
  });

  it("replaces the reader body with the youtube player", async () => {
    renderRoute();

    const dialog = await openReader(withYoutube.title);
    await userEvent.click(within(dialog).getAllByRole("button", { name: "Play video" })[0]);

    const player = document.querySelector('iframe[src*="youtube-nocookie.com/embed/"]');
    expect(player).not.toBeNull();
    expect(within(screen.getByRole("dialog")).queryByText("Текст под трейлером")).toBeNull();
    expect(mockOpenUrl).not.toHaveBeenCalled();
  });

  it("plays a vk attachment in an in-app iframe", async () => {
    renderRoute();
    const vk = first.attachments.find((attachment) => attachment.kind === "vk");

    const dialog = await openReader(first.title);
    await userEvent.click(within(dialog).getAllByRole("button", { name: "Play VK video" })[0]);

    const frame = document.querySelector("iframe");
    expect(frame?.getAttribute("src")).toBe(vk?.embedUrl);
    expect(mockOpenUrl).not.toHaveBeenCalled();
  });

  it("offers copy and save for the image in the viewer", async () => {
    renderRoute();

    const dialog = await openReader(first.title);
    await userEvent.click(within(dialog).getAllByRole("button", { name: "Open image" })[0]);
    fireEvent.contextMenu(openImageMenu());

    await waitFor(() => screen.getByRole("menuitem", { name: "Copy image" }));
    expect(screen.getByRole("menuitem", { name: "Save image as..." })).toBeTruthy();
  });

  it("copies the full-size cached attachment instead of the preview", async () => {
    mockImageCommands();
    mockWriteImage.mockResolvedValue(undefined);
    renderRoute();

    const dialog = await openReader(first.title);
    await userEvent.click(within(dialog).getAllByRole("button", { name: "Open image" })[0]);
    fireEvent.contextMenu(openImageMenu());
    await userEvent.click(await screen.findByRole("menuitem", { name: "Copy image" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("fetch_remote_image", {
        url: "https://shikimori.io/a/full.jpg",
        full: true,
      })
    );
    await waitFor(() => expect(mockWriteImage).toHaveBeenCalledWith(CACHED_IMAGE_PATH));
  });

  it("saves the cached attachment bytes under the detected format", async () => {
    mockImageCommands();
    mockDialogSave.mockResolvedValue("C:/out/full.webp");
    renderRoute();

    const dialog = await openReader(first.title);
    await userEvent.click(within(dialog).getAllByRole("button", { name: "Open image" })[0]);
    fireEvent.contextMenu(openImageMenu());
    await userEvent.click(await screen.findByRole("menuitem", { name: "Save image as..." }));

    await waitFor(() =>
      expect(mockDialogSave).toHaveBeenCalledWith(
        expect.objectContaining({ defaultPath: "full.webp" })
      )
    );
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("save_cached_image", {
        source: CACHED_IMAGE_PATH,
        path: "C:/out/full.webp",
      })
    );
  });

  it("opens the source page only from the explicit action", async () => {
    renderRoute();

    const dialog = await openReader(first.title);
    await userEvent.click(within(dialog).getByRole("button", { name: "Open on site" }));

    expect(mockOpenUrl).toHaveBeenCalledWith(first.siteUrl);
  });

  it("copies a deep link that points at the post page", async () => {
    renderRoute();

    const dialog = await openReader(first.title);
    await userEvent.click(within(dialog).getByRole("button", { name: "Copy link" }));

    expect(mockWriteText).toHaveBeenCalledWith("iluhaanime://news/101?page=1");
  });

  it("opens the reader for a deep link target", async () => {
    openNewsDeepLink({ id: withYoutube.id, page: 1 });
    renderRoute();

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getAllByText(withYoutube.title).length).toBeGreaterThan(0);
  });

  it("renders attachment links from the post text", async () => {
    renderRoute();

    const dialog = await openReader(first.title);
    await userEvent.click(within(dialog).getByRole("link", { name: "ссылке" }));

    expect(mockOpenUrl).toHaveBeenCalledWith("https://shikimori.io/animes/z1");
  });
});
