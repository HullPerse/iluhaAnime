import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSpellCheck } from "@/hooks/search/spellcheck.hook";
import { useSearchStore } from "@/store/search.store";

beforeEach(() => {
  vi.useFakeTimers();
  useSearchStore.setState({ spellDictionary: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

function check(query: string, history = ["frieren"]) {
  const { result } = renderHook(() => useSpellCheck(query, { history }));
  expect(result.current).toBeNull();
  act(() => {
    vi.advanceTimersByTime(400);
  });
  return result.current;
}

describe("useSpellCheck", () => {
  it("flags a one-letter typo as a warning", () => {
    expect(check("friren")).toMatchObject({
      correction: "frieren",
      start: 0,
      end: 6,
      severity: "warn",
      word: "friren",
    });
  });

  it("flags a two-letter typo as an error", () => {
    expect(check("frien")).toMatchObject({
      correction: "frieren",
      severity: "error",
    });
  });

  it("stays quiet on exact input", () => {
    expect(check("frieren")).toBeNull();
  });

  it("skips words from the user dictionary", () => {
    useSearchStore.getState().addSpellWord("friren");
    expect(check("friren")).toBeNull();
  });

  it("adds and removes dictionary words", () => {
    const store = useSearchStore.getState();
    store.addSpellWord("Friren");
    store.addSpellWord("friren");
    expect(useSearchStore.getState().spellDictionary).toEqual(["friren"]);
    store.removeSpellWord("FRiREN");
    expect(useSearchStore.getState().spellDictionary).toEqual([]);
  });
});
