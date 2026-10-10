import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Timeline from "@/routes/components/player/media/timeline.player";
import { playbackAtoms } from "@/store/player.store";
import { patchSettings } from "@/store/settings.store";

beforeEach(() => {
  patchSettings({ language: "en" });
  playbackAtoms.timePos.set(0);
});

afterEach(() => {
  cleanup();
});

function renderTimeline(duration = 1400, chapters = [{ time: 0, title: "Opening", end: 89 }]) {
  const callbacks = { onScrub: vi.fn(), onCommitSeek: vi.fn() };
  const result = render(
    <Timeline duration={duration} chapters={chapters} seekTarget={null} {...callbacks} />
  );
  const bar = result.container.querySelector(".h-4");
  if (!bar) throw new Error("timeline bar not found");
  return { ...result, bar, ...callbacks };
}

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

describe("Timeline scrub", () => {
  it("scrubs live and commits on release", () => {
    const { bar, onScrub, onCommitSeek } = renderTimeline();
    fireEvent.mouseDown(bar, { clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 150 });
    expect(onScrub).toHaveBeenCalled();
    fireEvent.mouseUp(document, { clientX: 150 });
    expect(onCommitSeek).toHaveBeenCalledTimes(1);
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
