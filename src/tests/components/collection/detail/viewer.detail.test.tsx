// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MediaViewerCollection } from "@/routes/components/collection/detail/viewer.detail";
import { useSettingsStore } from "@/store/settings.store";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

afterEach(() => {
  cleanup();
  mockInvoke.mockReset();
});

beforeEach(() => {
  useSettingsStore.setState({ tmdbApiKey: "key" });
});

const EMPTY_STORED: { stills: string[]; trailerYoutubeId: string | null } = {
  stills: [],
  trailerYoutubeId: null,
};
function renderViewer(
  stored: { stills: string[]; trailerYoutubeId: string | null } = EMPTY_STORED
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MediaViewerCollection tmdbId={1} anilistId={null} mediaType="movie" stored={stored} />
    </QueryClientProvider>
  );
}

const MEDIA = {
  backdrops: [{ url: "https://image.tmdb.org/t/p/w780/a.jpg" }],
  trailerYoutubeId: "abc123",
};

describe("MediaViewerCollection", () => {
  it("opens stills with a counter after fetching media", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue(MEDIA);
    renderViewer();
    await user.click(screen.getByRole("button", { name: /Кадры|Stills/ }));
    expect(await screen.findByText("1/1")).toBeDefined();
    expect(mockInvoke).toHaveBeenCalledWith("get_tmdb_media", expect.anything());
  });

  it("shows the trailer player when a trailer exists", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue(MEDIA);
    renderViewer();
    await user.click(screen.getByRole("button", { name: /Кадры|Stills/ }));
    await user.click(screen.getByRole("button", { name: /Трейлер|Trailer/ }));
    expect(document.querySelector("iframe")?.getAttribute("src")).toContain("abc123");
  });

  it("shows the empty state without stills or trailer", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ backdrops: [], trailerYoutubeId: null });
    renderViewer();
    await user.click(screen.getByRole("button", { name: /Кадры|Stills/ }));
    expect(await screen.findByText(/No results|Нет/i)).toBeDefined();
  });
  it("prefers stored stills without backend calls", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ backdrops: [], trailerYoutubeId: null });
    renderViewer({ stills: ["https://img/stored.jpg"], trailerYoutubeId: "stored1" });
    await user.click(screen.getByRole("button", { name: /Кадры|Stills/ }));
    expect(await screen.findByText("1/1")).toBeDefined();
    expect(mockInvoke).not.toHaveBeenCalledWith("get_tmdb_media", expect.anything());
    await user.click(screen.getByRole("button", { name: /Трейлер|Trailer/ }));
    expect(document.querySelector("iframe")?.getAttribute("src")).toContain("stored1");
  });
});
