import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DitherCanvas from "@/components/shared/dither.component";
import { ditherDecodeCache, ditherRenderCache, resetDitherWorker } from "@/lib/utils/dither.utils";
import type {
  DitherWorkerProgress,
  DitherWorkerRequest,
  DitherWorkerResponse,
} from "@/types/dither";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("DitherCanvas", () => {
  it("shows the raw image instantly while the dither computes", () => {
    render(<DitherCanvas src="/123.jpeg" />);
    expect(screen.getByRole("presentation", { hidden: true }).getAttribute("src")).toBe(
      "/123.jpeg"
    );
  });

  it("stays decorative without a label", () => {
    const { container } = render(<DitherCanvas src="/123.jpeg" />);
    expect(container.querySelector("canvas")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("exposes role img with a label", () => {
    render(<DitherCanvas src="/123.jpeg" ariaLabel="Print preview" />);
    expect(screen.getByRole("img", { name: "Print preview" })).toBeTruthy();
  });

  it("reports a missing 2D context through onError", () => {
    const onError = vi.fn();
    render(<DitherCanvas src="/123.jpeg" onError={onError} />);
    expect(onError).toHaveBeenCalledWith("DitherCanvas: 2D context is unavailable");
  });
});

interface MockImageHandle {
  fireLoad: () => void;
}

function installImageHarness(naturalWidth: number, naturalHeight: number): MockImageHandle[] {
  const instances: MockImageHandle[] = [];
  class MockImage {
    naturalWidth = naturalWidth;
    naturalHeight = naturalHeight;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    #src = "";
    get src(): string {
      return this.#src;
    }
    set src(value: string) {
      this.#src = value;
      instances.push({
        fireLoad: () => {
          this.onload?.();
        },
      });
    }
  }
  vi.stubGlobal("Image", MockImage as unknown as typeof Image);
  return instances;
}

function installCanvasHarness(source: Uint8ClampedArray) {
  const putImageData = vi.fn<(imageData: ImageData, dx: number, dy: number) => void>();
  const context = {
    drawImage: vi.fn(() => {}),
    getImageData: vi.fn(() => ({ data: source })),
    imageSmoothingEnabled: true,
    putImageData,
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D
  );
  function FakeImageData(data: Uint8ClampedArray, width: number, height: number) {
    return { data, width, height };
  }
  vi.stubGlobal("ImageData", FakeImageData as unknown as typeof ImageData);
  return { putImageData };
}

function installFrameHarness() {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
}

describe("DitherCanvas remount", () => {
  beforeEach(() => {
    ditherRenderCache.clear();
  });

  it("repaints the dithered frame instead of leaving a blank canvas", async () => {
    const source = new Uint8ClampedArray(2 * 1 * 4).fill(200);
    const first = installCanvasHarness(source);
    const firstImages = installImageHarness(4, 2);
    installFrameHarness();
    const mounted = render(<DitherCanvas src="/remount.jpg" />);
    await act(async () => {
      firstImages[0].fireLoad();
    });
    expect(first.putImageData).toHaveBeenCalledTimes(1);
    const firstBytes = Array.from(first.putImageData.mock.calls[0][0].data);
    mounted.unmount();
    const second = installCanvasHarness(source);
    const secondImages = installImageHarness(4, 2);
    render(<DitherCanvas src="/remount.jpg" />);
    await act(async () => {
      secondImages[0].fireLoad();
    });
    expect(second.putImageData).toHaveBeenCalledTimes(2);
    expect(Array.from(second.putImageData.mock.calls[1][0].data)).toEqual(firstBytes);
  });
});

interface MockWorkerHandle {
  posted: unknown[];
  respond: (response: DitherWorkerResponse | DitherWorkerProgress) => void;
}

function installWorkerHarness(): MockWorkerHandle {
  const posted: unknown[] = [];
  const listeners = new Map<string, Array<(event: { data: unknown }) => void>>();
  function MockWorker(_url: string | URL, _options?: WorkerOptions) {
    return {
      addEventListener: (type: string, listener: (event: { data: unknown }) => void) => {
        const list = listeners.get(type) ?? [];
        list.push(listener);
        listeners.set(type, list);
      },
      removeEventListener: (_type: string, _listener: (event: { data: unknown }) => void) => {},
      postMessage: (message: unknown) => {
        posted.push(message);
      },
      terminate: () => {},
    };
  }
  vi.stubGlobal("Worker", MockWorker as unknown as typeof Worker);
  return {
    posted,
    respond: (response: DitherWorkerResponse | DitherWorkerProgress) => {
      for (const listener of listeners.get("message") ?? []) listener({ data: response });
    },
  };
}
describe("DitherCanvas worker", () => {
  beforeEach(() => {
    ditherRenderCache.clear();
    resetDitherWorker();
  });
  it("paints worker bytes instead of computing on the main thread", async () => {
    const errors: string[] = [];
    const source = new Uint8ClampedArray(2 * 1 * 4).fill(200);
    const { putImageData } = installCanvasHarness(source);
    const images = installImageHarness(4, 2);
    const worker = installWorkerHarness();
    installFrameHarness();
    const { container } = render(
      <DitherCanvas
        src="/worker.jpg"
        onError={(message) => {
          errors.push(message);
        }}
      />
    );
    await act(async () => {
      images[0].fireLoad();
    });
    expect(errors).toEqual([]);
    expect(worker.posted).toHaveLength(1);
    const request = worker.posted[0] as DitherWorkerRequest;
    const workerBytes = new Uint8ClampedArray([40, 40, 40, 255]);
    await act(async () => {
      worker.respond({
        type: "result",
        id: request.id,
        width: 2,
        height: 1,
        pixels: workerBytes.buffer,
      });
    });
    expect(putImageData).toHaveBeenCalledTimes(1);
    expect(Array.from(putImageData.mock.calls[0][0].data)).toEqual(Array.from(workerBytes));
    expect(container.querySelector("canvas")?.getAttribute("aria-busy")).toBe("false");
  });

  it("ignores stale worker responses", async () => {
    const source = new Uint8ClampedArray(2 * 1 * 4).fill(200);
    const { putImageData } = installCanvasHarness(source);
    const images = installImageHarness(4, 2);
    const worker = installWorkerHarness();
    installFrameHarness();
    render(<DitherCanvas src="/stale.jpg" />);
    await act(async () => {
      images[0].fireLoad();
    });
    expect(worker.posted).toHaveLength(1);
    const request = worker.posted[0] as DitherWorkerRequest;
    await act(async () => {
      worker.respond({
        type: "result",
        id: request.id + 1,
        width: 2,
        height: 1,
        pixels: source.buffer.slice(0),
      });
    });
    expect(putImageData).not.toHaveBeenCalled();
  });

  it("forwards fresh worker progress and drops stale progress", async () => {
    const source = new Uint8ClampedArray(2 * 1 * 4).fill(200);
    installCanvasHarness(source);
    const images = installImageHarness(4, 2);
    const worker = installWorkerHarness();
    installFrameHarness();
    ditherRenderCache.clear();
    const onProgress = vi.fn();
    render(<DitherCanvas src="/progress.jpg" onProgress={onProgress} />);
    await act(async () => {
      images[0].fireLoad();
    });
    await act(async () => {
      worker.respond({ type: "progress", id: 1, done: 1, total: 2 });
    });
    expect(onProgress).toHaveBeenCalledWith(1, 2);
    await act(async () => {
      worker.respond({ type: "progress", id: 999, done: 2, total: 2 });
    });
    expect(onProgress).toHaveBeenCalledTimes(1);
  });
});

function installSplitCanvasHarness(source: Uint8ClampedArray) {
  const visibleDraw = vi.fn<() => void>();
  const visiblePut = vi.fn<(imageData: ImageData, dx: number, dy: number) => void>();
  const visibleCtx = {
    drawImage: visibleDraw,
    getImageData: vi.fn(() => ({ data: source })),
    imageSmoothingEnabled: true,
    putImageData: visiblePut,
  };
  const workDraw = vi.fn<() => void>();
  const workCtx = {
    drawImage: workDraw,
    getImageData: vi.fn(() => ({ data: source })),
    imageSmoothingEnabled: true,
    putImageData: vi.fn<(imageData: ImageData, dx: number, dy: number) => void>(),
  };
  let calls = 0;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => (++calls === 1 ? visibleCtx : workCtx) as unknown as CanvasRenderingContext2D
  );
  function FakeImageData(data: Uint8ClampedArray, width: number, height: number) {
    return { data, width, height };
  }
  vi.stubGlobal("ImageData", FakeImageData as unknown as typeof ImageData);
  return { visibleDraw, visiblePut, workDraw };
}

describe("DitherCanvas offscreen", () => {
  beforeEach(() => {
    ditherRenderCache.clear();
    ditherDecodeCache.clear();
    resetDitherWorker();
  });

  it("renders into a worker canvas and keeps the visible frame until bytes arrive", async () => {
    const source = new Uint8ClampedArray(2 * 1 * 4).fill(200);
    const { visibleDraw, visiblePut, workDraw } = installSplitCanvasHarness(source);
    const images = installImageHarness(4, 2);
    const worker = installWorkerHarness();
    installFrameHarness();
    render(<DitherCanvas src="/offscreen.jpg" />);
    await act(async () => {
      images[0].fireLoad();
    });
    expect(workDraw).toHaveBeenCalledTimes(1);
    expect(visibleDraw).not.toHaveBeenCalled();
    expect(visiblePut).not.toHaveBeenCalled();
    const workerBytes = new Uint8ClampedArray([40, 40, 40, 255, 40, 40, 40, 255]);
    await act(async () => {
      worker.respond({ type: "result", id: 1, width: 2, height: 1, pixels: workerBytes.buffer });
    });
    expect(visiblePut).toHaveBeenCalledTimes(1);
    expect(Array.from(visiblePut.mock.calls[0][0].data)).toEqual(Array.from(workerBytes));
  });

  it("reuses the decoded bitmap instead of reloading the image", async () => {
    const source = new Uint8ClampedArray(2 * 1 * 4).fill(200);
    installCanvasHarness(source);
    const images = installImageHarness(4, 2);
    installFrameHarness();
    ditherRenderCache.clear();
    ditherDecodeCache.clear();
    const bitmap = { width: 4, height: 2, close: vi.fn() };
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => bitmap)
    );
    const first = render(<DitherCanvas src="/decode.jpg" />);
    await act(async () => {
      images[0].fireLoad();
    });
    expect(images).toHaveLength(1);
    first.unmount();
    ditherRenderCache.clear();
    render(<DitherCanvas src="/decode.jpg" />);
    await act(async () => {});
    expect(images).toHaveLength(1);
    expect(bitmap.close).not.toHaveBeenCalled();
  });
});

describe("DitherCanvas display cap", () => {
  beforeEach(() => {
    ditherRenderCache.clear();
    ditherDecodeCache.clear();
    resetDitherWorker();
  });

  function renderCapped(capToDisplay: boolean) {
    const source = new Uint8ClampedArray(2 * 1 * 4).fill(200);
    installCanvasHarness(source);
    const images = installImageHarness(3840, 2160);
    const worker = installWorkerHarness();
    installFrameHarness();
    const { container } = render(<DitherCanvas src="/capped.jpg" capToDisplay={capToDisplay} />);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    Object.defineProperty(canvas, "clientWidth", { value: 672 });
    Object.defineProperty(canvas, "clientHeight", { value: 256 });
    return { images, worker };
  }

  it("renders at display resolution when capped", async () => {
    const { images, worker } = renderCapped(true);
    await act(async () => {
      images[0].fireLoad();
    });
    expect(worker.posted).toHaveLength(1);
    const request = worker.posted[0] as DitherWorkerRequest;
    expect(request.width).toBe(672);
    expect(request.height).toBe(378);
  });

  it("renders at full scale without the cap", async () => {
    const { images, worker } = renderCapped(false);
    await act(async () => {
      images[0].fireLoad();
    });
    expect(worker.posted).toHaveLength(1);
    const request = worker.posted[0] as DitherWorkerRequest;
    expect(request.width).toBe(1920);
    expect(request.height).toBe(1080);
  });

  it("caps the long side at maxLongSide", async () => {
    const source = new Uint8ClampedArray(2 * 1 * 4).fill(200);
    installCanvasHarness(source);
    const images = installImageHarness(7680, 4320);
    const worker = installWorkerHarness();
    installFrameHarness();
    ditherRenderCache.clear();
    ditherDecodeCache.clear();
    resetDitherWorker();
    render(<DitherCanvas src="/bakeside.jpg" maxLongSide={1920} />);
    await act(async () => {
      images[0].fireLoad();
    });
    expect(worker.posted).toHaveLength(1);
    const request = worker.posted[0] as DitherWorkerRequest;
    expect(request.width).toBe(1920);
    expect(request.height).toBe(1080);
  });
});
