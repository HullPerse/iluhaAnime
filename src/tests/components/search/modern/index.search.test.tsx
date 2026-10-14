import { mockInvoke } from "../../../mocks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SearchModern from "@/routes/components/search/modern/index.search";
import { notificationAtoms } from "@/store/notification.store";
import { patchSettings, settingsAtoms } from "@/store/settings.store";
import type { UserImageFile } from "@/types/userimage";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

const WALLPAPER: UserImageFile = {
  id: "real-id",
  name: "wall.png",
  mimeType: "image/png",
  path: "C:/images/wall.png",
  originalPath: null,
  version: "3",
  createdAt: 1,
};

function renderModern() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SearchModern />
    </QueryClientProvider>
  );
}

function errorMessages() {
  return notificationAtoms.items
    .get()
    .filter((item) => item.type === "error")
    .map((item) => item.message);
}

function tabLoaderShown(container: HTMLElement) {
  return [...container.querySelectorAll('[aria-busy="true"]')].some((el) =>
    el.classList.contains("min-h-40")
  );
}

afterEach(() => cleanup());

beforeEach(() => {
  patchSettings({ language: "en", selectedDitherId: null });
  notificationAtoms.items.set([]);
  notificationAtoms.unreadCount.set(0);
  notificationAtoms.dismissed.set([]);
  mockInvoke.mockReset();
});

describe("SearchModern wallpaper gate", () => {
  it("renders the search panel when the bundled placeholder is selected", async () => {
    patchSettings({ selectedDitherId: "placeholder" });
    mockInvoke.mockImplementation(async () => false);
    const { container } = renderModern();
    await waitFor(() => expect(screen.getByPlaceholderText("Search anime...")).toBeTruthy());
    expect(tabLoaderShown(container)).toBe(false);
    expect(mockInvoke).not.toHaveBeenCalledWith("get_dither_image", expect.anything());
  });

  it("shows a loader while a stored wallpaper is being fetched, then renders", async () => {
    patchSettings({ selectedDitherId: "real-id" });
    let resolveFetch!: (value: UserImageFile) => void;
    const pending = new Promise<UserImageFile>((resolve) => {
      resolveFetch = resolve;
    });
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_dither_image") return pending;
      return false;
    });
    const { container } = renderModern();
    await waitFor(() => expect(tabLoaderShown(container)).toBe(true));
    expect(screen.queryByPlaceholderText("Search anime...")).toBeNull();
    resolveFetch(WALLPAPER);
    await waitFor(() => expect(screen.getByPlaceholderText("Search anime...")).toBeTruthy());
    expect(tabLoaderShown(container)).toBe(false);
  });

  it("falls back to the placeholder when the stored wallpaper is gone", async () => {
    patchSettings({ selectedDitherId: "real-id" });
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_dither_image") throw new Error("gone");
      return false;
    });
    const { container } = renderModern();
    await waitFor(() => expect(screen.getByPlaceholderText("Search anime...")).toBeTruthy());
    expect(tabLoaderShown(container)).toBe(false);
    // The stale id is dropped so the lookup is not retried (and no error toast
    // is shown) on the next launch.
    await waitFor(() => expect(settingsAtoms.selectedDitherId.get()).toBeNull());
    expect(errorMessages()).toEqual([]);
  });
});
