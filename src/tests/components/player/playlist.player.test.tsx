import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: () => Promise.resolve(null),
}));

import { fetchVideoCard, resetCardCache } from "@/lib/player/cardCache.utils";
import PlaylistBody from "@/routes/components/player/media/playlist.player";
import { playbackAtoms } from "@/store/player.store";
import { patchSettings } from "@/store/settings.store";

const ENTRIES = [
  { index: 0, filename: "D:/a.mkv", title: "" },
  { index: 1, filename: "D:/b.mkv", title: "" },
];

function props() {
  return {
    onPlay: () => Promise.resolve(),
    onRemove: () => Promise.resolve(),
    onMove: () => Promise.resolve(),
  };
}

beforeEach(() => {
  resetCardCache();
  invokeMock.mockReset();
  invokeMock.mockImplementation((command: unknown) => {
    if (command === "player_playlist_entries") return Promise.resolve(ENTRIES);
    if (command === "get_video_card")
      return Promise.resolve({ path: "thumb.jpg", duration: 10, size: 100 });
    return Promise.resolve(undefined);
  });
  patchSettings({ language: "en" });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type IntersectionHandler = (entries: Array<{ isIntersecting: boolean }>) => void;

function stubIntersectionObserver(): { trigger: (visible: boolean) => void } {
  let handler: IntersectionHandler | null = null;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionHandler) {
        handler = callback;
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  );
  return {
    trigger: (visible: boolean) => {
      act(() => {
        handler?.([{ isIntersecting: visible }]);
      });
    },
  };
}

describe("PlaylistBody thumbnails", () => {
  it("syncs a prefetched card that lands after mount instead of sticking null", async () => {
    const { trigger } = stubIntersectionObserver();
    playbackAtoms.path.set("D:/a.mkv");
    const { container } = render(<PlaylistBody {...props()} />);
    await vi.waitFor(() => {
      expect(container.querySelectorAll('[data-testid="playlist-card"]')).toHaveLength(2);
    });
    const second = container.querySelectorAll('[data-testid="playlist-card"]')[1];
    // Second row mounted while off-screen and uncached: placeholder, no fetch.
    expect(second.querySelector('img[src*="thumb"]')).toBeNull();
    // Prefetch wave completes while the row is still off-screen.
    const prefilled = await fetchVideoCard("D:/b.mkv");
    if (!prefilled) throw new Error("prefill fetch returned null");
    // Row scrolls into view: the cached art must sync into state even
    // though no fetch runs anymore.
    trigger(true);
    await vi.waitFor(() => {
      expect(second.querySelector('img[src*="thumb"]')).not.toBeNull();
    });
    const bFetches = invokeMock.mock.calls.filter(
      ([c, args]) => c === "get_video_card" && (args as { path?: string }).path === "D:/b.mkv"
    );
    expect(bFetches).toHaveLength(1);
  });

  it("fetches its own card when nothing is cached", async () => {
    const { container } = render(<PlaylistBody {...props()} />);
    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="playlist-card"]')).not.toBeNull();
    });
    await vi.waitFor(() => {
      expect(container.querySelector('img[src*="thumb"]')).not.toBeNull();
    });
    expect(invokeMock).toHaveBeenCalledWith("get_video_card", { path: "D:/a.mkv" });
  });
});

describe("PlaylistBody mutations", () => {
  function entriesCalls(): number {
    return invokeMock.mock.calls.filter(([command]) => command === "player_playlist_entries")
      .length;
  }

  it("does not refetch entries after remove (count subscriber covers it)", async () => {
    const onRemove = vi.fn(() => Promise.resolve());
    render(<PlaylistBody {...props()} onRemove={onRemove} />);
    const [remove] = await screen.findAllByRole("button", { name: "Remove from queue" });
    fireEvent.click(remove);
    await vi.waitFor(() => {
      expect(onRemove).toHaveBeenCalledTimes(1);
    });
    await vi.waitFor(() => {
      expect(entriesCalls()).toBe(1);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(entriesCalls()).toBe(1);
  });

  it("still refetches entries after move (count is unchanged)", async () => {
    const onMove = vi.fn(() => Promise.resolve());
    render(<PlaylistBody {...props()} onMove={onMove} />);
    const [moveDown] = await screen.findAllByRole("button", { name: "Move down" });
    fireEvent.click(moveDown);
    await vi.waitFor(() => {
      expect(onMove).toHaveBeenCalledTimes(1);
    });
    await vi.waitFor(() => {
      expect(entriesCalls()).toBe(2);
    });
  });
});
