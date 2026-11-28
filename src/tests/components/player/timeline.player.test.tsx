import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Timeline from "@/routes/components/player/media/timeline.player";
import { playbackAtoms, streamSession } from "@/store/player.store";
import { patchSettings } from "@/store/settings.store";
import type { StreamOpen } from "@/types/player/videoPlayer";

beforeEach(() => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  patchSettings({ language: "ru" });
  playbackAtoms.timePos.set(0);
  playbackAtoms.cacheDuration.set(undefined);
  playbackAtoms.cacheStart.set(undefined);
  playbackAtoms.cacheEnd.set(undefined);
  streamSession.set(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
  streamSession.set(null);
});

const renderTimeline = (duration = 1400, chapters = [{ time: 0, title: "Opening", end: 89 }]) => {
  const callbacks = { onScrub: vi.fn(), onCommitSeek: vi.fn() };
  const result = render(
    <Timeline duration={duration} chapters={chapters} seekTarget={null} {...callbacks} />
  );
  const bar = result.container.querySelector(".h-4");

  if (!bar) throw new Error("timeline bar not found");

  return { ...result, bar, ...callbacks };
};

it("keeps the time field width when duration loads and remaining time is toggled", () => {
  const props = { chapters: [], seekTarget: null, onScrub: vi.fn(), onCommitSeek: vi.fn() };
  const { getByRole, rerender } = render(<Timeline duration={0} {...props} />);
  const time = getByRole("button", { pressed: false });
  const initialWidth = time.style.width;
  expect(initialWidth).not.toBe("");
  rerender(<Timeline duration={7325} {...props} />);
  expect(time.textContent).toContain("2:02:05");
  expect(time.style.width).toBe(initialWidth);
  fireEvent.click(time);
  expect(time.getAttribute("aria-pressed")).toBe("true");
  expect(time.style.width).toBe(initialWidth);
});

describe("Timeline hover tooltip", () => {
  it("shows time with no thumbnail image", () => {
    const { bar, container } = renderTimeline();
    fireEvent.mouseMove(bar, { clientX: 100 });
    const tooltip = container.querySelector(".bottom-full");
    expect(tooltip).not.toBeNull();
    expect(tooltip?.textContent).toContain("0:00");
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[role="img"]')).toBeNull();
  });

  it("shows the chapter title under the cursor", () => {
    const { bar, container } = renderTimeline();
    fireEvent.mouseMove(bar, { clientX: 100 });
    expect(container.textContent).toContain("Opening");
  });

  it("clears the tooltip when the cursor leaves the bar", () => {
    const { bar, container } = renderTimeline();
    fireEvent.mouseMove(bar, { clientX: 100 });
    expect(container.querySelector(".bottom-full")).not.toBeNull();
    fireEvent.mouseLeave(bar);
    expect(container.querySelector(".bottom-full")).toBeNull();
  });
});

describe("Timeline buffered span", () => {
  const streaming = () => streamSession.set({} as StreamOpen);

  it("draws nothing for a local file", () => {
    playbackAtoms.timePos.set(280);
    playbackAtoms.cacheDuration.set(140);
    const { bar, queryByTestId } = renderTimeline(1400);

    expect(queryByTestId("timeline-buffered-track")).toBeNull();
    fireEvent.mouseMove(bar, { clientX: 100 });

    expect(queryByTestId("timeline-buffered")).toBeNull();
  });

  it("keeps a thin track visible without hover and fills it on hover", () => {
    streaming();
    playbackAtoms.timePos.set(280);
    playbackAtoms.cacheStart.set(280);
    playbackAtoms.cacheEnd.set(420);
    const { bar, getByTestId, queryByTestId } = renderTimeline(1400);

    expect(queryByTestId("timeline-buffered")).toBeNull();
    const track = getByTestId("timeline-buffered-track");
    expect(track.style.left).toBe("20%");
    expect(track.style.width).toBe("10%");

    fireEvent.mouseMove(bar, { clientX: 100 });

    const buffered = getByTestId("timeline-buffered");
    expect(buffered.style.left).toBe("20%");
    expect(buffered.style.width).toBe("10%");
  });

  it("includes the back buffer mpv kept behind the playhead", () => {
    streaming();
    playbackAtoms.timePos.set(280);
    playbackAtoms.cacheStart.set(210);
    playbackAtoms.cacheEnd.set(350);
    const { getByTestId } = renderTimeline(1400);

    const track = getByTestId("timeline-buffered-track");
    expect(track.style.left).toBe("15%");
    expect(track.style.width).toBe("10%");
  });

  it("falls back to the reported cache duration when the timestamps are missing", () => {
    streaming();
    playbackAtoms.timePos.set(280);
    playbackAtoms.cacheDuration.set(140);
    const { getByTestId } = renderTimeline(1400);

    const track = getByTestId("timeline-buffered-track");
    expect(track.style.left).toBe("20%");
    expect(track.style.width).toBe("10%");
  });

  it("shows no span before the cache reports one", () => {
    streaming();
    const { bar, queryByTestId } = renderTimeline(1400);
    fireEvent.mouseMove(bar, { clientX: 100 });

    expect(queryByTestId("timeline-buffered-track")).toBeNull();
    expect(queryByTestId("timeline-buffered")).toBeNull();
  });

  it("does not draw past the end of the video", () => {
    streaming();
    playbackAtoms.timePos.set(1330);
    playbackAtoms.cacheStart.set(1330);
    playbackAtoms.cacheEnd.set(1530);
    const { getByTestId } = renderTimeline(1400);

    const track = getByTestId("timeline-buffered-track");
    expect(track.style.left).toBe("95%");
    expect(track.style.width).toBe("5%");
  });

  it("keeps the buffered state out of the hover tooltip", () => {
    streaming();
    playbackAtoms.timePos.set(0);
    playbackAtoms.cacheStart.set(0);
    playbackAtoms.cacheEnd.set(140);
    const { bar, container } = renderTimeline(1400);
    fireEvent.mouseMove(bar, { clientX: 100 });
    const tooltip = container.querySelector(".bottom-full")?.textContent ?? "";
    expect(tooltip).toContain("0:00");
    expect(tooltip).not.toContain("Buffered to");
    expect(tooltip).not.toContain("Will need loading");

    fireEvent.mouseMove(bar, { clientX: 1350 });
    const outside = container.querySelector(".bottom-full")?.textContent ?? "";
    expect(outside).not.toContain("Buffered to");
    expect(outside).not.toContain("Will need loading");
  });
});

describe("Timeline scrub", () => {
  it("exposes keyboard seeking and cancels a drag when focus is lost", () => {
    const { bar, getByRole, onCommitSeek, onScrub } = renderTimeline(100);
    expect(getByRole("slider").getAttribute("aria-valuemax")).toBe("100");
    fireEvent.keyDown(bar, { key: "End" });
    expect(onCommitSeek).toHaveBeenLastCalledWith(100);
    fireEvent.pointerDown(bar, { clientX: 10, button: 0 });
    fireEvent.blur(window);
    fireEvent.pointerMove(window, { clientX: 30 });
    fireEvent.pointerUp(window, { clientX: 30 });
    expect(onScrub).not.toHaveBeenCalled();
    expect(onCommitSeek).toHaveBeenCalledTimes(1);
    expect(document.body.style.userSelect).toBe("");
  });

  it("scrubs live and commits on release", () => {
    const { bar, onScrub, onCommitSeek } = renderTimeline();
    fireEvent.pointerDown(bar, { clientX: 100, button: 0 });
    fireEvent.pointerMove(window, { clientX: 150 });
    expect(onScrub).toHaveBeenCalled();
    fireEvent.pointerUp(window, { clientX: 150 });
    expect(onCommitSeek).toHaveBeenCalledTimes(1);
  });
});

describe("Timeline remaining toggle", () => {
  const toggleName = "Переключить прошедшее / оставшееся время";

  it("toggles between elapsed and remaining on click", () => {
    const { getByRole } = renderTimeline();
    const toggle = getByRole("button", { name: toggleName });
    expect(toggle.tagName).toBe("BUTTON");
    expect(toggle.textContent).toBe("0:00 / 23:20");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.textContent).toBe("-23:20");
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
