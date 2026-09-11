import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import QueuePanel from "@/routes/components/player/queue.player";
import { useSettingsStore } from "@/store/settings.store";
import { useUpscaleQueueStore } from "@/store/upscale.store";
import type { UpscaleQueueItem } from "@/types/upscale";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

function failedItem(): UpscaleQueueItem {
  return {
    id: "q1",
    jobType: "upscale",
    filePath: "/a.mkv",
    outputPath: "/b.mkv",
    name: "a.mkv",
    config: {
      width: 0,
      height: 0,
      targetFps: null,
      interpolate: false,
      quality: "balanced",
      gpuBackend: "gpu",
      videoCodec: "hevc10",
      aiUpscaler: null,
      selectedShaders: [],
    },
    status: "error",
    progress: 41,
    error: "ffmpeg crashed",
  };
}

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
  useUpscaleQueueStore.setState({ items: [], paused: false, processing: false });
});

describe("QueuePanel retry failed", () => {
  it("shows the full error on hover and requeues every failed job", async () => {
    const user = userEvent.setup();
    useUpscaleQueueStore.setState({ items: [failedItem()], paused: true });
    render(<QueuePanel scan={null} />);

    expect(screen.getByText("ffmpeg crashed").title).toBe("ffmpeg crashed");

    await user.click(screen.getByTitle("Retry failed"));

    expect(
      useUpscaleQueueStore.getState().items.every((item) => item.status === "queued")
    ).toBe(true);
  });

  it("hides the retry button without failures", () => {
    useUpscaleQueueStore.setState({ items: [] });
    render(<QueuePanel scan={null} />);
    expect(screen.queryByTitle("Retry failed")).toBeNull();
  });
});
