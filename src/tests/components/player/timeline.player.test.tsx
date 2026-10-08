import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

import Timeline, { selectThumbUrl } from "@/routes/components/player/media/timeline.player";
import { playbackAtoms } from "@/store/player.store";
import { patchSettings } from "@/store/settings.store";

function hoverCalls(): Array<{ path?: string }> {
  return invokeMock.mock.calls
    .filter(([command]) => command === "player_hover_thumb")
    .map(([, args]) => args as { path?: string });
}

beforeEach(() => {
  vi.useFakeTimers();
  patchSettings({ language: "en" });
  playbackAtoms.timePos.set(0);
  invokeMock.mockReset();
  invokeMock.mockImplementation((command: unknown) => {
    if (command === "player_hover_thumb")
      return Promise.resolve({ url: "thumb.jpg", captured: false });
    return Promise.resolve(undefined);
  });
  playbackAtoms.path.set("/a.mkv");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderTimeline(duration = 1400) {
  const callbacks = { onScrub: vi.fn(), onCommitSeek: vi.fn() };
  const result = render(
    <Timeline duration={duration} chapters={[]} seekTarget={null} {...callbacks} />
  );
  const bar = result.container.querySelector(".h-4");
  if (!bar) throw new Error("timeline bar not found");
  return { ...result, bar, ...callbacks };
}

describe("Timeline hover captures", () => {
  it("does not capture thumbnails while scrubbing", async () => {
    const { bar } = renderTimeline();
    fireEvent.mouseDown(bar, { clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 150 });
    await vi.advanceTimersByTimeAsync(500);
    expect(hoverCalls()).toHaveLength(0);
  });

  it("captures for the drop position once the drag ends", async () => {
    const { bar, container, onCommitSeek } = renderTimeline();
    fireEvent.mouseDown(bar, { clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 150 });
    fireEvent.mouseUp(document, { clientX: 150 });
    expect(onCommitSeek).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(hoverCalls()).toHaveLength(1);
    expect(container.querySelector('img[src*="thumb"]')).not.toBeNull();
  });
});

describe("selectThumbUrl", () => {
  it("shows only the capture matching the current hover position", () => {
    expect(selectThumbUrl({ url: "a.jpg", time: 10 }, 10)).toBe("a.jpg");
    expect(selectThumbUrl({ url: "a.jpg", time: 10 }, 20)).toBeNull();
    expect(selectThumbUrl({ url: "a.jpg", time: 10 }, null)).toBeNull();
    expect(selectThumbUrl(null, 10)).toBeNull();
  });
});

describe("Timeline remaining toggle", () => {
  const toggleName = "Toggle elapsed / remaining time";

  it("toggles between elapsed and remaining on click", () => {
    const { getByRole } = renderTimeline();
    const toggle = getByRole("button", { name: toggleName });
    expect(toggle.tagName).toBe("BUTTON");
    expect(toggle.textContent).toBe("0:00 / 23:20");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.textContent).toBe("-23:20 / 23:20");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.textContent).toBe("0:00 / 23:20");
  });

  it("keeps the hint visible in both modes", () => {
    const { getByRole } = renderTimeline();
    const toggle = getByRole("button", { name: toggleName });
    expect(toggle.getAttribute("title")).toBe(toggleName);
    fireEvent.click(toggle);
    expect(toggle.getAttribute("title")).toBe(toggleName);
  });

  it("shows elapsed when the duration is unknown", () => {
    const { getByRole } = renderTimeline(0);
    const toggle = getByRole("button", { name: toggleName });
    fireEvent.click(toggle);
    expect(toggle.textContent).toBe("0:00 / 0:00");
  });
});
