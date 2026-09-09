// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MediaViewerContent } from "@/routes/components/collection/detail/viewer.detail";
import { useSettingsStore } from "@/store/settings.store";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@videojs/react/media/youtube-video", () => ({
  YouTubeVideo: ({ src }: { src: string }) => <div data-testid="youtube-player" data-src={src} />,
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

function renderWithClient(element: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>);
}

function buttonsProps(stored = EMPTY_STORED) {
  return {
    tmdbId: 1,
    anilistId: null as number | null,
    mediaType: "movie" as const,
    stored,
  };
}

const MEDIA = {
  backdrops: [{ url: "https://image.tmdb.org/t/p/w780/a.jpg" }],
  trailerYoutubeId: "abc123",
};

function renderContent(
  props: Partial<Parameters<typeof MediaViewerContent>[0]> & { stored?: ReturnType<typeof buttonsProps>["stored"] } = {}
) {
  const onTabChange = vi.fn();
  const view = renderWithClient(
    <MediaViewerContent
      {...buttonsProps(props.stored)}
      activeTab={props.activeTab ?? "frames"}
      onTabChange={onTabChange}
    />
  );
  return { ...view, onTabChange };
}

describe("MediaViewerContent", () => {
  it("renders stills with a counter after fetching media", async () => {
    mockInvoke.mockResolvedValue(MEDIA);
    renderContent();
    expect(await screen.findByText("1/1")).toBeDefined();
    expect(mockInvoke).toHaveBeenCalledWith("get_tmdb_media", expect.anything());
  });

  it("renders the trailer player when the trailer tab is active", async () => {
    mockInvoke.mockResolvedValue(MEDIA);
    renderContent({ activeTab: "trailer" });
    await vi.waitFor(() => {
      expect(screen.getByTestId("youtube-player").dataset.src).toContain("abc123");
    });
  });

  it("shows the empty state without stills or trailer", async () => {
    mockInvoke.mockResolvedValue({ backdrops: [], trailerYoutubeId: null });
    renderContent();
    expect(await screen.findByText(/No results|Нет|Кадр/i)).toBeDefined();
  });

  it("prefers stored stills without backend calls", async () => {
    mockInvoke.mockResolvedValue({ backdrops: [], trailerYoutubeId: null });
    renderContent({ stored: { stills: ["https://img/stored.jpg"], trailerYoutubeId: "stored1" } });
    expect(await screen.findByText("1/1")).toBeDefined();
    expect(mockInvoke).not.toHaveBeenCalledWith("get_tmdb_media", expect.anything());
  });

  it("renders tabs with the active one disabled and flips via onTabChange", async () => {
    mockInvoke.mockResolvedValue(MEDIA);
    const { onTabChange } = renderContent();
    const framesTab = await screen.findByRole("tab", { name: /Кадры|Stills/ });
    expect(framesTab.getAttribute("aria-selected")).toBe("true");
    expect(framesTab.hasAttribute("disabled")).toBe(true);
    const trailerTab = screen.getByRole("tab", { name: /Трейлер|Trailer/ });
    expect(trailerTab.hasAttribute("disabled")).toBe(false);
    await userEvent.setup().click(trailerTab);
    expect(onTabChange).toHaveBeenCalledWith("trailer");
  });

  it("hides the trailer tab without a trailer", async () => {
    mockInvoke.mockResolvedValue({ backdrops: [{ url: "https://image.tmdb.org/t/p/w780/a.jpg" }], trailerYoutubeId: null });
    renderContent();
    expect(await screen.findByRole("tab", { name: /Кадры|Stills/ })).toBeDefined();
    expect(screen.queryByRole("tab", { name: /Трейлер|Trailer/ })).toBeNull();
  });

  it("highlights the active thumbnail and flips frames with the strip", async () => {
    mockInvoke.mockResolvedValue({
      backdrops: [
        { url: "https://image.tmdb.org/t/p/w780/a.jpg" },
        { url: "https://image.tmdb.org/t/p/w780/b.jpg" },
      ],
      trailerYoutubeId: "abc123",
    });
    renderContent();
    const frame1 = await screen.findByRole("option", { name: /Кадр 1|Frame 1/ });
    expect(frame1.getAttribute("aria-selected")).toBe("true");
    const frame2 = screen.getByRole("option", { name: /Кадр 2|Frame 2/ });
    await userEvent.setup().click(frame2);
    expect(screen.getByText("2/2")).toBeDefined();
    expect(frame2.getAttribute("aria-selected")).toBe("true");
    expect(frame1.getAttribute("aria-selected")).toBe("false");
  });
});
