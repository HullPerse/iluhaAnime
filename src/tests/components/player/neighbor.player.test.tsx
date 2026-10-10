import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

import { resetCardCache } from "@/lib/player/cardCache.utils";
import NeighborFileButton from "@/routes/components/player/media/neighbor.player";
import { playbackAtoms } from "@/store/player.store";
import { patchSettings } from "@/store/settings.store";

const DEFAULT_ENTRIES = [
  { index: 0, filename: "D:/a.mkv", title: "" },
  { index: 1, filename: "D:/b.mkv", title: "" },
  { index: 2, filename: "D:/c.mkv", title: "" },
];

let liveEntries = DEFAULT_ENTRIES;

function renderButton(direction: "prev" | "next", onActivate = () => undefined) {
  return render(
    <NeighborFileButton
      direction={direction}
      hasTarget
      title={direction === "prev" ? "Previous file" : "Next file"}
      ariaLabel={direction === "prev" ? "Previous file" : "Next file"}
      onActivate={onActivate}
    />
  );
}

beforeEach(() => {
  resetCardCache();
  liveEntries = DEFAULT_ENTRIES;
  invokeMock.mockReset();
  invokeMock.mockImplementation((command: unknown) => {
    if (command === "player_playlist_entries") return Promise.resolve(liveEntries);
    if (command === "get_video_card")
      return Promise.resolve({ path: "thumb.jpg", duration: 65, size: 10 });
    return Promise.resolve(undefined);
  });
  patchSettings({ language: "en", parseTitlesPlayer: false });
  playbackAtoms.path.set("D:/b.mkv");
  playbackAtoms.playlistIndex.set(-1);
});

afterEach(() => {
  cleanup();
});

describe("NeighborFileButton", () => {
  it("shows the next file card with thumbnail on focus", async () => {
    const { container } = renderButton("next");
    fireEvent.focus(screen.getByRole("button", { name: "Next file" }));
    await vi.waitFor(() => {
      expect(container.querySelector('img[src*="thumb"]')).not.toBeNull();
    });
    expect(screen.getByText("c.mkv")).toBeTruthy();
    expect(screen.getByText("1:05")).toBeTruthy();
  });

  it("shows the previous file card on focus", async () => {
    const { container } = renderButton("prev");
    fireEvent.focus(screen.getByRole("button", { name: "Previous file" }));
    await vi.waitFor(() => {
      expect(container.querySelector('img[src*="thumb"]')).not.toBeNull();
    });
    expect(screen.getByText("a.mkv")).toBeTruthy();
  });

  it("shows the card on mouse over without a second entries fetch", async () => {
    const { container } = renderButton("next");
    const wrapper = screen.getByRole("button", { name: "Next file" }).parentElement;
    if (!wrapper) throw new Error("neighbor button wrapper is missing");
    fireEvent.mouseOver(wrapper);
    await vi.waitFor(() => {
      expect(screen.getByText("c.mkv")).toBeTruthy();
    });
    expect(container.querySelector('img[src*="thumb"]')).not.toBeNull();
  });

  it("closes the card on blur", async () => {
    const { container } = renderButton("next");
    const button = screen.getByRole("button", { name: "Next file" });
    fireEvent.focus(button);
    await vi.waitFor(() => {
      expect(screen.getByText("c.mkv")).toBeTruthy();
    });
    fireEvent.blur(button);
    expect(container.querySelector('img[src*="thumb"]')).toBeNull();
    expect(screen.queryByText("c.mkv")).toBeNull();
  });

  it("activates the navigation callback on click", () => {
    const onActivate = vi.fn();
    renderButton("next", onActivate);
    fireEvent.click(screen.getByRole("button", { name: "Next file" }));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("fetches nothing when there is no target file", async () => {
    render(
      <NeighborFileButton
        direction="next"
        hasTarget={false}
        title="Next file"
        ariaLabel="Next file"
        onActivate={() => undefined}
      />
    );
    fireEvent.focus(screen.getByRole("button", { name: "Next file" }));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(invokeMock).not.toHaveBeenCalled();
    expect(screen.queryByText("c.mkv")).toBeNull();
  });

  it("resolves the true slot when the path repeats in the queue", async () => {
    liveEntries = [
      { index: 0, filename: "D:/x.mkv", title: "" },
      { index: 1, filename: "D:/a.mkv", title: "" },
      { index: 2, filename: "D:/x.mkv", title: "" },
    ];
    playbackAtoms.path.set("D:/x.mkv");
    playbackAtoms.playlistIndex.set(2);
    renderButton("prev");
    fireEvent.focus(screen.getByRole("button", { name: "Previous file" }));
    await vi.waitFor(() => {
      expect(screen.getByText("a.mkv")).toBeTruthy();
    });
  });

  it("falls back to path search on a stale backend index", async () => {
    playbackAtoms.path.set("D:/c.mkv");
    playbackAtoms.playlistIndex.set(0);
    renderButton("prev");
    fireEvent.focus(screen.getByRole("button", { name: "Previous file" }));
    await vi.waitFor(() => {
      expect(screen.getByText("b.mkv")).toBeTruthy();
    });
  });
});
