import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import PlayerStatus from "@/routes/components/player/media/status.player";
import { patchSettings } from "@/store/settings.store";

beforeEach(() => {
  patchSettings({ language: "en" });
});

afterEach(() => {
  cleanup();
});

function overlayOf(text: string): HTMLElement | null {
  return screen.getByText(text).closest("div.absolute");
}

describe("PlayerStatus", () => {
  it("renders the finished overlay on a solid background", () => {
    render(
      <PlayerStatus
        visible
        finished
        eofPaused={false}
        failed={false}
        loading={false}
        hasNext={false}
        onRestart={() => undefined}
        onNext={() => undefined}
        onClose={() => undefined}
      />
    );

    const overlay = overlayOf("Playback finished");
    expect(overlay?.className).toContain("bg-black");
    expect(overlay?.className).not.toContain("bg-black/50");
  });

  it("renders the failed overlay on a solid background", () => {
    render(
      <PlayerStatus
        visible
        finished={false}
        eofPaused={false}
        failed
        loading={false}
        hasNext={false}
        onRestart={() => undefined}
        onNext={() => undefined}
        onClose={() => undefined}
      />
    );

    const overlay = overlayOf("Playback error");
    expect(overlay?.className).toContain("bg-black");
  });

  it("hides the finished overlay while a file is loading", () => {
    render(
      <PlayerStatus
        visible
        finished
        eofPaused={false}
        failed={false}
        loading
        hasNext
        onRestart={() => undefined}
        onNext={() => undefined}
        onClose={() => undefined}
      />
    );

    expect(screen.queryByText("Playback finished")).toBeNull();
  });

  it("still shows the failed overlay while a file is loading", () => {
    render(
      <PlayerStatus
        visible
        finished={false}
        eofPaused={false}
        failed
        loading
        hasNext={false}
        onRestart={() => undefined}
        onNext={() => undefined}
        onClose={() => undefined}
      />
    );

    expect(screen.getByText("Playback error")).toBeDefined();
  });
});
