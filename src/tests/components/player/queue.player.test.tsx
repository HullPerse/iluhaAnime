import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import QueuePanel from "@/routes/components/player/queue.player";
import { patchSettings } from "@/store/settings.store";
import { upscaleItems } from "@/store/upscale.store";
import type { UpscaleConfig, UpscaleQueueItem } from "@/types/core/upscale";

const CONFIG: UpscaleConfig = {
  width: 1920,
  height: 1080,
  targetFps: null,
  interpolate: false,
  quality: "balanced",
  gpuBackend: "auto",
  videoCodec: "h264",
  aiUpscaler: null,
  selectedShaders: [],
  temporalDenoise: false,
};

const item = (id: string, name: string): UpscaleQueueItem => {
  return {
    id,
    jobType: "upscale",
    filePath: `D:/${name}`,
    outputPath: `D:/out/${name}`,
    name,
    config: CONFIG,
    status: "queued",
    progress: 0,
  };
};

const queueToggle = (): HTMLElement => {
  return screen.getByTestId("queue-toggle");
};

beforeEach(() => {
  patchSettings({ language: "ru" });
  upscaleItems.set([]);
});

afterEach(() => {
  cleanup();
  upscaleItems.set([]);
});

describe("QueuePanel", () => {
  it("renders nothing without items", () => {
    const { container } = render(<QueuePanel open onToggle={() => undefined} />);

    expect(container.querySelector("section")).toBeNull();
  });

  it("reports a header click to its owner instead of toggling itself", () => {
    upscaleItems.set([item("job_1", "a.mkv")]);
    const onToggle = vi.fn();

    render(<QueuePanel open onToggle={onToggle} />);
    fireEvent.click(queueToggle());

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(queueToggle().getAttribute("aria-expanded")).toBe("true");
  });

  it("keeps the body mounted only while the owner says it is open", () => {
    upscaleItems.set([item("job_1", "a.mkv")]);
    const { rerender } = render(<QueuePanel open onToggle={() => undefined} />);
    expect(screen.getByText("a.mkv")).toBeTruthy();

    rerender(<QueuePanel open={false} onToggle={() => undefined} />);
    expect(queueToggle().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("a.mkv")).toBeNull();
  });
});
