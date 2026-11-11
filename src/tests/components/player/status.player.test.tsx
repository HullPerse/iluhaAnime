import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import PlayerStatus from "@/routes/components/player/media/status.player";
import { patchSettings } from "@/store/settings.store";

const baseProps = {
  visible: true,
  finished: false,
  eofPaused: false,
  failed: false,
  loading: false,
  hasNext: false,
  streaming: false,
  onRestart: () => undefined,
  onRetry: () => undefined,
  onNext: () => undefined,
  onClose: () => undefined,
};

beforeEach(() => {
  patchSettings({ language: "en" });
});

afterEach(() => {
  cleanup();
});

describe("PlayerStatus", () => {
  it("hides the finished overlay while a file is loading", () => {
    render(<PlayerStatus {...baseProps} finished loading hasNext />);

    expect(screen.queryByText("Playback finished")).toBeNull();
  });

  it("still shows the failed overlay while a file is loading", () => {
    render(<PlayerStatus {...baseProps} failed loading />);

    expect(screen.getByText("Playback error")).toBeDefined();
  });
});
