import { mockInvoke } from "@/tests/mocks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useWallpaperImage } from "@/hooks/wallpaper.hook";
import { patchSettings } from "@/store/settings.store";
import type { UserImageFile } from "@/types/core/userimage";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

const renderWallpaper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useWallpaperImage(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
};

beforeEach(() => {
  mockInvoke.mockReset();
  patchSettings({ selectedDitherId: null });
});

describe("useWallpaperImage", () => {
  it("skips the native lookup for the bundled placeholder id", async () => {
    patchSettings({ selectedDitherId: "placeholder" });
    renderWallpaper();
    await act(async () => {});
    expect(mockInvoke).not.toHaveBeenCalledWith("get_dither_image", expect.anything());
  });

  it("drops the previous wallpaper when the selection is cleared", async () => {
    const wallpaper: UserImageFile = {
      id: "real-id",
      name: "wall.png",
      mimeType: "image/png",
      path: "C:/images/wall.png",
      originalPath: null,
      version: "3",
      createdAt: 1,
    };
    mockInvoke.mockImplementation(async (cmd: string) =>
      cmd === "get_dither_image" ? wallpaper : false
    );
    patchSettings({ selectedDitherId: "real-id" });
    const { result } = renderWallpaper();
    await waitFor(() => expect(result.current.data?.id).toBe("real-id"));

    act(() => patchSettings({ selectedDitherId: null }));
    await waitFor(() => expect(result.current.data).toBeUndefined());
  });
});
