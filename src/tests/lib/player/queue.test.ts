import { describe, expect, it } from "vitest";

import { translate } from "@/lib/locale/i18n.utils";
import { queueDepthSteps } from "@/lib/player/queue.utils";
import type { UpscaleQueueItem } from "@/types";

const ru = (key: Parameters<typeof translate>[1]) => translate("ru", key);

function upscale(overrides: Partial<UpscaleQueueItem> = {}): UpscaleQueueItem {
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
      selectedShaders: ["Upscale x2", "Deband"],
    },
    status: "processing",
    progress: 41,
    ...overrides,
  };
}

describe("queueDepthSteps", () => {
  it("maps backend stages onto extract/upscale/encode", () => {
    const steps = queueDepthSteps(upscale({ stage: "upscaling" }), ru);
    expect(steps.map((s) => s.label)).toEqual(["Извлечение", "Апскейл", "Кодирование"]);
    expect(steps[0]?.done).toBe(true);
    expect(steps[1]?.active).toBe(true);
    expect(steps[1]?.percent).toBe(41);
    expect(steps[2]?.done).toBe(false);
  });

  it("names the upscaler and codec in step details", () => {
    const steps = queueDepthSteps(
      upscale({
        stage: "encoding",
        config: { ...(upscale().config as object), aiUpscaler: "realcugan" } as never,
      }),
      ru
    );
    expect(steps[1]?.detail).toBe("realcugan");
    expect(steps[2]?.detail).toBe("hevc10");
    expect(steps[2]?.active).toBe(true);
  });

  it("marks everything done on completion", () => {
    const steps = queueDepthSteps(upscale({ status: "done", progress: 100 }), ru);
    expect(steps.every((s) => s.done && s.percent === 100)).toBe(true);
  });

  it("keeps queued items pending", () => {
    const steps = queueDepthSteps(upscale({ status: "queued", progress: 0, stage: undefined }), ru);
    expect(steps.every((s) => !s.done && !s.active && s.percent === 0)).toBe(true);
  });

  it("renders convert jobs as a single step", () => {
    const steps = queueDepthSteps(
      {
        ...upscale({ status: "processing", progress: 10 }),
        jobType: "convert",
        config: { targetFormat: "mp4", copyStreams: true },
      },
      ru
    );
    expect(steps.length).toBe(1);
    expect(steps[0]?.label).toBe("Конверт");
    expect(steps[0]?.detail).toBe("mp4");
    expect(steps[0]?.active).toBe(true);
  });
});
