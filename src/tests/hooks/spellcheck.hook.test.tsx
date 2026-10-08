import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSpellCheck, useSpellCorrections } from "@/hooks/search/spellcheck.hook";
import { addSpellWord, removeSpellWord, searchAtoms } from "@/store/search.store";

beforeEach(() => {
  vi.useFakeTimers();
  searchAtoms.spellDictionary.set([]);
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

function settle() {
  act(() => {
    vi.advanceTimersByTime(400);
  });
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
    addSpellWord("friren");
    expect(check("friren")).toBeNull();
  });

  it("adds and removes dictionary words", () => {
    addSpellWord("Friren");
    addSpellWord("friren");
    expect(searchAtoms.spellDictionary.get()).toEqual(["friren"]);
    removeSpellWord("FRiREN");
    expect(searchAtoms.spellDictionary.get()).toEqual([]);
  });

  it("returns the identical object when the query is retyped", () => {
    const history = ["frieren"];
    const { result, rerender } = renderHook(({ query }) => useSpellCheck(query, { history }), {
      initialProps: { query: "friren" },
    });
    settle();
    const first = result.current;
    expect(first).not.toBeNull();
    rerender({ query: "frirenx" });
    settle();
    rerender({ query: "friren" });
    settle();
    expect(result.current).toBe(first);
  });

  it("keeps identity when option arrays are recreated with the same content", () => {
    const { result, rerender } = renderHook(({ history }) => useSpellCheck("friren", { history }), {
      initialProps: { history: ["frieren"] },
    });
    settle();
    const first = result.current;
    expect(first).not.toBeNull();
    rerender({ history: ["frieren"] });
    expect(result.current).toBe(first);
  });

  it("recomputes when the flagged word itself changes", () => {
    const history = ["frieren"];
    const { result, rerender } = renderHook(({ query }) => useSpellCheck(query, { history }), {
      initialProps: { query: "friren" },
    });
    settle();
    const first = result.current;
    rerender({ query: "frien" });
    settle();
    expect(result.current).not.toBeNull();
    expect(result.current).not.toBe(first);
    expect(result.current).toMatchObject({ word: "frien", severity: "error" });
  });
});

describe("useSpellCorrections", () => {
  function corrections(query: string, history = ["frieren"], limit = 3) {
    const { result } = renderHook(() => useSpellCorrections(query, { history }, limit));
    expect(result.current).toEqual([]);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    return result.current;
  }

  it("returns the single correction for a one-candidate typo", () => {
    expect(corrections("friren")).toEqual(["frieren"]);
  });

  it("returns best-first variants capped by the limit", () => {
    const history = ["frieren", "frisen"];
    expect(corrections("friren", history, 3)).toEqual(["frieren", "frisen"]);
    expect(corrections("friren", history, 1)).toEqual(["frieren"]);
  });

  it("keeps the top entry equal to the single-check correction", () => {
    const history = ["frieren", "frisen"];
    const top = corrections("friren", history, 3)[0] ?? null;
    expect(check("friren", history)?.correction).toBe(top);
  });

  it("stays silent on exact input and dictionary words", () => {
    expect(corrections("frieren")).toEqual([]);
    addSpellWord("friren");
    expect(corrections("friren")).toEqual([]);
  });
});
