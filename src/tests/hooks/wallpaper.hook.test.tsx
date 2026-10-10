import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useWallpaperImage } from "@/hooks/wallpaper.hook";
import { patchSettings } from "@/store/settings.store";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

function renderWallpaper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useWallpaperImage(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

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
});
