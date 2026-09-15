import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { assetUrl } from "@/lib/utils/image.utils";
import SearchModern from "@/routes/components/search/modern/index.search";
import { useNotificationStore } from "@/store/notification.store";
import { useSettingsStore } from "@/store/settings.store";
import type { Anime } from "@/types/torrent";
import type { UserImageFile } from "@/types/userimage";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));
function renderModern() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SearchModern />
    </QueryClientProvider>
  );
}

const FIRST: UserImageFile = {
  id: "aaa",
  name: "first.png",
  mimeType: "image/png",
  path: "C:/images/aaa.png",
  originalPath: "C:/images/aaa.original.png",
  version: null,
  createdAt: 10,
};
const SECOND: UserImageFile = {
  ...FIRST,
  id: "bbb",
  name: "second.png",
  path: "C:/images/bbb.png",
};

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  crossOrigin = "";
  naturalWidth = 640;
  naturalHeight = 480;
  #src = "";
  get src(): string {
    return this.#src;
  }
  set src(value: string) {
    this.#src = value;
    queueMicrotask(() => this.onload?.());
  }
}

function wallpaperSrc(): string | null {
  const canvas = document.querySelector(
    'section canvas[aria-label="placeholder"]'
  ) as HTMLCanvasElement | null;
  return canvas?.dataset.src ?? null;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.stubGlobal("Image", FakeImage);
  useSettingsStore.setState({
    language: "en",
    selectedDitherId: null,
    wallpaperShadow: {
      sides: { top: false, right: false, bottom: false, left: false },
      intensity: 50,
      color: "#000000",
      length: 8,
      softness: 40,
    },
  });
  useNotificationStore.setState({ items: [], unreadCount: 0, dismissed: [] });
  mockInvoke.mockReset();
});

describe("SearchModern wallpaper", () => {
  it("shows the placeholder when nothing is selected", async () => {
    mockInvoke.mockResolvedValue([]);
    renderModern();
    await waitFor(() => expect(wallpaperSrc()).toBe("/wallpaper_placeholder.jpg"));
    expect(mockInvoke).not.toHaveBeenCalledWith("get_dither_image", expect.anything());
  });

  it("shows the selected image from the database", async () => {
    useSettingsStore.setState({ selectedDitherId: "aaa" });
    mockInvoke.mockResolvedValue(FIRST);
    renderModern();
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("get_dither_image", { id: "aaa" }));
    await waitFor(() => expect(wallpaperSrc()).toBe(assetUrl(FIRST.path)));
    expect(mockInvoke).not.toHaveBeenCalledWith("list_dither_image_meta", expect.anything());
  });

  it("falls back to the placeholder for a stale selection", async () => {
    useSettingsStore.setState({ selectedDitherId: "gone" });
    mockInvoke.mockRejectedValue(new Error("dither image not found"));
    renderModern();
    await waitFor(() => expect(wallpaperSrc()).toBe("/wallpaper_placeholder.jpg"));
  });

  it("falls back to the placeholder and notifies on load failure", async () => {
    useSettingsStore.setState({ selectedDitherId: "aaa" });
    mockInvoke.mockRejectedValue(new Error("db gone"));
    renderModern();
    await waitFor(() =>
      expect(
        useNotificationStore
          .getState()
          .items.filter((item) => item.type === "error")
          .map((item) => item.message)
      ).toContain("Could not load images.")
    );
    expect(wallpaperSrc()).toBe("/wallpaper_placeholder.jpg");
  });

  it("shows a loader while the wallpaper resolves", async () => {
    useSettingsStore.setState({ selectedDitherId: "aaa" });
    let resolveImage!: (value: UserImageFile) => void;
    mockInvoke.mockImplementation(
      () =>
        new Promise<UserImageFile>((resolve) => {
          resolveImage = resolve;
        })
    );
    renderModern();
    expect(document.querySelector('div.bg-surface[aria-busy="true"]')).toBeTruthy();
    await act(async () => {
      resolveImage(FIRST);
    });
    await waitFor(() => expect(wallpaperSrc()).toBe(assetUrl(FIRST.path)));
  });

  it("keeps the previous image while the next one loads", async () => {
    useSettingsStore.setState({ selectedDitherId: "aaa" });
    mockInvoke.mockResolvedValue(FIRST);
    renderModern();
    await waitFor(() => expect(wallpaperSrc()).toBe(assetUrl(FIRST.path)));
    let resolveSecond!: (value: UserImageFile) => void;
    mockInvoke.mockImplementation(
      () =>
        new Promise<UserImageFile>((resolve) => {
          resolveSecond = resolve;
        })
    );
    await act(async () => {
      useSettingsStore.setState({ selectedDitherId: "bbb" });
    });
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("get_dither_image", { id: "bbb" }));
    expect(wallpaperSrc()).toBe(assetUrl(FIRST.path));
    expect(document.querySelector('div.bg-surface[aria-busy="true"]')).toBeNull();
    await act(async () => {
      resolveSecond(SECOND);
    });
    await waitFor(() => expect(wallpaperSrc()).toBe(assetUrl(SECOND.path)));
  });

  it("paints the wallpaper shadow on an overlay above the image", async () => {
    useSettingsStore.setState({
      selectedDitherId: "aaa",
      wallpaperShadow: {
        sides: { top: true, right: false, bottom: false, left: false },
        intensity: 50,
        color: "#000000",
        length: 8,
        softness: 40,
      },
    });
    mockInvoke.mockResolvedValue(FIRST);
    renderModern();
    await waitFor(() => expect(wallpaperSrc()).toBe(assetUrl(FIRST.path)));
    const overlay = document.querySelector('div[style*="linear-gradient"]');
    expect(overlay?.getAttribute("style")).toContain("linear-gradient");
  });

  it("renders no shadow overlay by default", async () => {
    mockInvoke.mockResolvedValue([]);
    renderModern();
    await waitFor(() => expect(wallpaperSrc()).toBe("/wallpaper_placeholder.jpg"));
    expect(document.querySelector('div[style*="linear-gradient"]')).toBeNull();
  });
});

describe("SearchModern observer mascot", () => {
  function mascot(): HTMLImageElement | null {
    return document.querySelector<HTMLImageElement>('img[src="/avatar.png"]');
  }

  function panel(): HTMLElement | null {
    return document.querySelector("section.absolute");
  }

  function overlapRect(left: number, top: number, right: number, bottom: number): DOMRect {
    return {
      left,
      top,
      right,
      bottom,
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
      toJSON: () => {},
    } as DOMRect;
  }

  const ROW: Anime = {
    title: "Mock Frieren 1080p",
    magnet: "",
    torrent: "",
    size: "1 GiB",
    seeders: 10,
    leechers: 1,
    category: "Anime",
    link: "https://example.com/mock",
  };

  function searchInvoke(command: string) {
    if (command === "search_erairaws") return Promise.resolve([ROW]);
    if (command.startsWith("check_")) return Promise.resolve(false);
    return Promise.resolve([]);
  }

  async function submitQuery(query: string) {
    const user = userEvent.setup();
    const input = screen.getByPlaceholderText("Search anime...");
    await user.type(input, query);
    const bar = input.closest("section");
    if (!bar?.parentElement) throw new Error("Input row not found");
    await user.click(within(bar.parentElement).getAllByRole("button").at(-1)!);
  }

  it("is hidden while the setting is off", async () => {
    useSettingsStore.setState({ searchMascotEnabled: false });
    mockInvoke.mockResolvedValue([]);
    renderModern();
    await waitFor(() => expect(wallpaperSrc()).toBe("/wallpaper_placeholder.jpg"));
    expect(mascot()).toBeNull();
  });

  it("renders a click-through image when the setting is on", async () => {
    useSettingsStore.setState({ searchMascotEnabled: true });
    mockInvoke.mockResolvedValue([]);
    renderModern();
    await waitFor(() => expect(mascot()).toBeTruthy());
    const wrapper = screen.getByTestId("search-mascot");
    expect(wrapper.className).toContain("pointer-events-none");
    expect(wrapper?.className).toContain("size-54");
    expect(wrapper?.className).toContain("opacity-100");
  });

  it("reacts to the toggle without a reload", async () => {
    useSettingsStore.setState({ searchMascotEnabled: false });
    mockInvoke.mockResolvedValue([]);
    renderModern();
    await waitFor(() => expect(wallpaperSrc()).toBe("/wallpaper_placeholder.jpg"));
    expect(mascot()).toBeNull();

    await act(async () => {
      useSettingsStore.setState({ searchMascotEnabled: true });
    });
    expect(mascot()).toBeTruthy();
  });

  it("hides the mascot while results are docked", async () => {
    useSettingsStore.setState({ searchMascotEnabled: true });
    mockInvoke.mockImplementation(searchInvoke);
    renderModern();
    await waitFor(() => expect(mascot()).toBeTruthy());
    await submitQuery("frieren");
    await waitFor(() => expect(panel()?.classList.contains("top-2")).toBe(true));
    expect(await screen.findByText("Mock Frieren 1080p")).not.toBeNull();
    expect(mascot()).toBeNull();
  });

  it("shows the mascot again after hiding results", async () => {
    useSettingsStore.setState({ searchMascotEnabled: true });
    mockInvoke.mockImplementation(searchInvoke);
    const user = userEvent.setup();
    renderModern();
    await waitFor(() => expect(mascot()).toBeTruthy());
    await submitQuery("frieren");
    await waitFor(() => expect(panel()?.classList.contains("top-2")).toBe(true));
    expect(mascot()).toBeNull();
    await user.click(screen.getByTitle("Hide results"));
    await waitFor(() => expect(panel()?.classList.contains("top-1/2")).toBe(true));
    expect(mascot()).toBeTruthy();
  });
  it("dims the mascot while the panel sits on it", async () => {
    useSettingsStore.setState({ searchMascotEnabled: true });
    mockInvoke.mockImplementation(searchInvoke);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function elementRect(
      this: Element
    ) {
      if (this.querySelector?.('img[src="/avatar.png"]')) return overlapRect(0, 400, 216, 616);
      return overlapRect(0, 300, 600, 500);
    });
    renderModern();
    await waitFor(() => expect(mascot()).toBeTruthy());
    await waitFor(() =>
      expect(screen.getByTestId("search-mascot").className).toContain("opacity-50")
    );
  });

  it("stays opaque while the panel only grazes the mascot", async () => {
    useSettingsStore.setState({ searchMascotEnabled: true });
    mockInvoke.mockImplementation(searchInvoke);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function elementRect(
      this: Element
    ) {
      if (this.querySelector?.('img[src="/avatar.png"]')) return overlapRect(0, 400, 216, 616);
      return overlapRect(200, 556, 776, 800);
    });
    renderModern();
    await waitFor(() => expect(mascot()).toBeTruthy());
    expect(screen.getByTestId("search-mascot").className).toContain("opacity-100");
  });
  it("dims the mascot that mounts after the wallpaper loader", async () => {
    useSettingsStore.setState({ searchMascotEnabled: true, selectedDitherId: "aaa" });
    mockInvoke.mockImplementation((command: string) =>
      command === "get_dither_image" ? Promise.resolve(FIRST) : searchInvoke(command)
    );
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function elementRect(
      this: Element
    ) {
      if (this.querySelector?.('img[src="/avatar.png"]')) return overlapRect(0, 400, 216, 616);
      return overlapRect(0, 300, 600, 500);
    });
    renderModern();
    await waitFor(() => expect(mascot()).toBeTruthy());
    await waitFor(() =>
      expect(screen.getByTestId("search-mascot").className).toContain("opacity-50")
    );
  });

  it("keeps the mascot fully opaque away from the panel", async () => {
    useSettingsStore.setState({ searchMascotEnabled: true });
    mockInvoke.mockImplementation(searchInvoke);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function elementRect(
      this: Element
    ) {
      if (this.querySelector?.('img[src="/avatar.png"]')) return overlapRect(0, 400, 216, 616);
      return overlapRect(900, 300, 1476, 460);
    });
    renderModern();
    await waitFor(() => expect(mascot()).toBeTruthy());
    await waitFor(() =>
      expect(screen.getByTestId("search-mascot").className).toContain("opacity-100")
    );
  });
});
