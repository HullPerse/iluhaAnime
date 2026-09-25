import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useLiveResource } from "@/hooks/liveResource.hook";

describe("useLiveResource", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function renderResource(fetch: (key: number) => Promise<boolean>, pauseOnHidden = true) {
    return renderHook(() =>
      useLiveResource({
        intervalMs: 1000,
        collectKeys: () => [1],
        shouldFetch: () => true,
        fetch,
        pauseOnHidden,
      })
    );
  }

  it("sweeps on mount and on the interval when the page is visible", async () => {
    const fetch = vi.fn().mockResolvedValue(true);
    const render = renderResource(fetch);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetch).toHaveBeenCalledTimes(3);
    render.unmount();
  });

  it("skips sweeps while the document is hidden", async () => {
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    const fetch = vi.fn().mockResolvedValue(true);
    const render = renderResource(fetch);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch).not.toHaveBeenCalled();
    render.unmount();
  });

  it("keeps polling while hidden when pauseOnHidden is false", async () => {
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    const fetch = vi.fn().mockResolvedValue(true);
    const render = renderResource(fetch, false);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    render.unmount();
  });
});
