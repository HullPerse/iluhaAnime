import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SkipButton from "@/routes/components/player/media/skip.player";
import { usePlaybackStore } from "@/store/player.store";
import { useSettingsStore } from "@/store/settings.store";
import type { MpvChapter } from "@/types/videoPlayer";

const CHAPTERS: MpvChapter[] = [
  { title: "Opening", time: 0, end: 90 },
  { title: "Main", time: 90 },
  { title: "Ending", time: 1300 },
];

function showAt(timePos: number) {
  usePlaybackStore.setState({ timePos });
}

beforeEach(() => {
  vi.useFakeTimers();
  useSettingsStore.setState({ language: "en" });
  showAt(10);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SkipButton auto-hide", () => {
  it("hides the button after 8 seconds of being ignored", () => {
    render(
      <SkipButton
        duration={1400}
        chapters={CHAPTERS}
        hasNext={false}
        onSkip={() => undefined}
        onFileNext={() => undefined}
      />
    );

    expect(screen.getByText("Skip")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(screen.queryByText("Skip")).toBeNull();
  });

  it("shows the button again after seeking back into the same chapter", () => {
    render(
      <SkipButton
        duration={1400}
        chapters={CHAPTERS}
        hasNext={false}
        onSkip={() => undefined}
        onFileNext={() => undefined}
      />
    );

    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(screen.queryByText("Skip")).toBeNull();

    act(() => {
      showAt(5);
    });
    expect(screen.getByText("Skip")).toBeTruthy();
  });

  it("shows the button again at the next skippable chapter", () => {
    render(
      <SkipButton
        duration={1400}
        chapters={CHAPTERS}
        hasNext={false}
        onSkip={() => undefined}
        onFileNext={() => undefined}
      />
    );

    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(screen.queryByText("Skip")).toBeNull();

    act(() => {
      showAt(1350);
    });
    expect(screen.getByText("Skip")).toBeTruthy();
  });

  it("renders nothing for chapters without a skippable title", () => {
    showAt(200);
    render(
      <SkipButton
        duration={1400}
        chapters={CHAPTERS}
        hasNext={false}
        onSkip={() => undefined}
        onFileNext={() => undefined}
      />
    );

    expect(screen.queryByText("Skip")).toBeNull();
  });
});
