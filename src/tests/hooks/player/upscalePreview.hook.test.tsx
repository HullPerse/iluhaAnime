import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockInvoke } from "@/tests/mocks";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

import { useUpscalePreview } from "@/hooks/player/upscalePreview.hook";
import { patchSettings } from "@/store/settings.store";
import type { PreviewFrame } from "@/types/core/upscale";

const FRAME: PreviewFrame = {
  timestamp: 1,
  before: "b1",
  after: "a1",
};

const params = (overrides: Partial<Parameters<typeof useUpscalePreview>[0]> = {}) => {
  return {
    filePath: "D:/video/ep01.mkv",
    resolution: "1920x1080",
    selectedShaders: ["shader-a"],
    temporalDenoise: false,
    ...overrides,
  };
};

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  patchSettings({ language: "en" });
  mockInvoke.mockReset();
});

describe("useUpscalePreview", () => {
  it("loads frames with the requested dimensions", async () => {
    mockInvoke.mockResolvedValue([FRAME]);
    const { result } = renderHook(() => useUpscalePreview(params()));

    act(() => result.current.load());

    await waitFor(() => expect(result.current.frames).toEqual([FRAME]));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(mockInvoke).toHaveBeenCalledWith(
      "preview_upscale_frames",
      expect.objectContaining({ width: 1920, height: 1080 })
    );
  });

  it("keeps frames across rerenders that do not change the request", async () => {
    mockInvoke.mockResolvedValue([FRAME]);
    const { result, rerender } = renderHook(() => useUpscalePreview(params()));

    act(() => result.current.load());
    await waitFor(() => expect(result.current.frames).toEqual([FRAME]));

    rerender();

    expect(result.current.frames).toEqual([FRAME]);
  });

  it("drops frames when a setting changes", async () => {
    mockInvoke.mockResolvedValue([FRAME]);
    const { result, rerender } = renderHook(
      (props: Parameters<typeof useUpscalePreview>[0]) => useUpscalePreview(props),
      { initialProps: params() }
    );

    act(() => result.current.load());
    await waitFor(() => expect(result.current.frames).toEqual([FRAME]));

    rerender(params({ temporalDenoise: true }));

    expect(result.current.frames).toEqual([]);
  });

  it("ignores a late response for a superseded request", async () => {
    let resolveFrames: (frames: PreviewFrame[]) => void = () => undefined;
    mockInvoke.mockImplementation(
      () =>
        new Promise<PreviewFrame[]>((resolve) => {
          resolveFrames = resolve;
        })
    );
    const { result, rerender } = renderHook(
      (props: Parameters<typeof useUpscalePreview>[0]) => useUpscalePreview(props),
      { initialProps: params() }
    );

    act(() => result.current.load());
    rerender(params({ selectedShaders: ["shader-b"] }));

    await act(async () => {
      resolveFrames([FRAME]);
    });

    expect(result.current.frames).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("requests a full-frame preview for the original resolution", async () => {
    mockInvoke.mockResolvedValue([FRAME]);
    const { result } = renderHook(() => useUpscalePreview(params({ resolution: "original" })));

    act(() => result.current.load());

    await waitFor(() => expect(result.current.frames).toEqual([FRAME]));
    expect(mockInvoke).toHaveBeenCalledWith(
      "preview_upscale_frames",
      expect.objectContaining({ width: 0, height: 0 })
    );
  });

  it("surfaces the command failure message", async () => {
    mockInvoke.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useUpscalePreview(params()));

    act(() => result.current.load());

    await waitFor(() => expect(result.current.error).toBe("boom"));
    expect(result.current.frames).toEqual([]);
  });

  it("reports a malformed resolution as a preview failure", () => {
    const { result } = renderHook(() => useUpscalePreview(params({ resolution: "abc" })));

    act(() => result.current.load());

    expect(result.current.error).toBe("Preview failed");
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
