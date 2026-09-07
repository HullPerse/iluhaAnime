import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SearchModern from "@/routes/components/search/modern/index.search";
import { useNotificationStore } from "@/store/notification.store";
import { useSettingsStore } from "@/store/settings.store";
import type { UserImage } from "@/types";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));
function renderModern() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SearchModern />
    </QueryClientProvider>
  );
}

const FIRST: UserImage = {
  id: "aaa",
  name: "first.png",
  mimeType: "image/png",
  dataUrl: "data:image/png;base64,AAAA",
  originalSrc: "data:image/png;base64,AAAA",
  createdAt: 10,
};
const SECOND: UserImage = {
  ...FIRST,
  id: "bbb",
  name: "second.png",
  dataUrl: "data:image/png;base64,BBBB",
};

function wallpaperSrc(): string | null {
  return document.querySelector('section img[alt="placeholder"]')?.getAttribute("src") ?? null;
}

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({
    language: "en",
    selectedDitherId: null,
    wallpaperShadow: {
      sides: { top: false, right: false, bottom: false, left: false },
      intensity: 50,
      color: "#000000",
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
    await waitFor(() => expect(wallpaperSrc()).toBe("data:image/png;base64,AAAA"));
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
    let resolveImage!: (value: UserImage) => void;
    mockInvoke.mockImplementation(
      () =>
        new Promise<UserImage>((resolve) => {
          resolveImage = resolve;
        })
    );
    renderModern();
    expect(document.querySelector('div.bg-surface[aria-busy="true"]')).toBeTruthy();
    await act(async () => {
      resolveImage(FIRST);
    });
    await waitFor(() => expect(wallpaperSrc()).toBe("data:image/png;base64,AAAA"));
  });

  it("keeps the previous image while the next one loads", async () => {
    useSettingsStore.setState({ selectedDitherId: "aaa" });
    mockInvoke.mockResolvedValue(FIRST);
    renderModern();
    await waitFor(() => expect(wallpaperSrc()).toBe("data:image/png;base64,AAAA"));
    let resolveSecond!: (value: UserImage) => void;
    mockInvoke.mockImplementation(
      () =>
        new Promise<UserImage>((resolve) => {
          resolveSecond = resolve;
        })
    );
    await act(async () => {
      useSettingsStore.setState({ selectedDitherId: "bbb" });
    });
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("get_dither_image", { id: "bbb" }));
    expect(wallpaperSrc()).toBe("data:image/png;base64,AAAA");
    expect(document.querySelector('div.bg-surface[aria-busy="true"]')).toBeNull();
    await act(async () => {
      resolveSecond(SECOND);
    });
    await waitFor(() => expect(wallpaperSrc()).toBe("data:image/png;base64,BBBB"));
  });

  it("paints the wallpaper shadow on an overlay above the image", async () => {
    useSettingsStore.setState({
      selectedDitherId: "aaa",
      wallpaperShadow: {
        sides: { top: true, right: false, bottom: false, left: false },
        intensity: 50,
        color: "#000000",
      },
    });
    mockInvoke.mockResolvedValue(FIRST);
    renderModern();
    await waitFor(() => expect(wallpaperSrc()).toBe("data:image/png;base64,AAAA"));
    const overlay = document.querySelector('div[style*="box-shadow"]');
    expect(overlay?.getAttribute("style")).toContain("inset");
  });

  it("renders no shadow overlay by default", async () => {
    mockInvoke.mockResolvedValue([]);
    renderModern();
    await waitFor(() => expect(wallpaperSrc()).toBe("/wallpaper_placeholder.jpg"));
    expect(document.querySelector('div[style*="box-shadow"]')).toBeNull();
  });
});
