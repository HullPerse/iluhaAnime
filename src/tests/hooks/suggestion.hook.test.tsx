import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { collectionApi } from "@/api/collection.api";
import { useSuggestions } from "@/hooks/search/suggestion.hook";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(collectionApi, "searchUnifiedIndex").mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("useSuggestions", () => {
  it("does not query the backend until the debounce settles", () => {
    const spy = vi.mocked(collectionApi.searchUnifiedIndex);
    const { rerender } = renderHook(({ query }) => useSuggestions(query, "anilist", 8), {
      initialProps: { query: "" },
    });
    rerender({ query: "frie" });
    expect(spy).not.toHaveBeenCalled();
    advance(150);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenLastCalledWith("frie", "anilist", 8);
  });

  it("coalesces rapid keystrokes into a single backend call", () => {
    const spy = vi.mocked(collectionApi.searchUnifiedIndex);
    const { rerender } = renderHook(({ query }) => useSuggestions(query, "anilist", 8), {
      initialProps: { query: "" },
    });
    rerender({ query: "fr" });
    rerender({ query: "fri" });
    rerender({ query: "frie" });
    expect(spy).not.toHaveBeenCalled();
    advance(150);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenLastCalledWith("frie", "anilist", 8);
  });

  it("skips one-character queries", () => {
    const spy = vi.mocked(collectionApi.searchUnifiedIndex);
    const { result, rerender } = renderHook(({ query }) => useSuggestions(query, "anilist", 8), {
      initialProps: { query: "" },
    });
    rerender({ query: "f" });
    advance(500);
    expect(spy).not.toHaveBeenCalled();
    expect(result.current).toEqual([]);
  });
});
