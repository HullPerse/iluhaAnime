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

  it("flags every misspelled word with its own span", () => {
    const history = ["frieren", "attack"];
    const { result } = renderHook(() => useSpellCheck("friren attak", { history }));
    settle();
    expect(result.current).toMatchObject({
      correction: "frieren attack",
      word: "friren",
      spans: [
        { start: 0, end: 6, severity: "warn", word: "friren", corrected: "frieren" },
        { start: 7, end: 12, severity: "warn", word: "attak", corrected: "attack" },
      ],
    });
  });

  it("still flags later words when an earlier word is in the dictionary", () => {
    addSpellWord("friren");
    const history = ["frieren", "attack"];
    const { result } = renderHook(() => useSpellCheck("friren attak", { history }));
    settle();
    expect(result.current).toMatchObject({
      word: "attak",
      spans: [{ start: 7, end: 12, word: "attak", corrected: "attack" }],
    });
  });

  it("keeps an untouched highlight while typing elsewhere", () => {
    const history = ["frieren"];
    const { result, rerender } = renderHook(({ query }) => useSpellCheck(query, { history }), {
      initialProps: { query: "friren" },
    });
    settle();
    const first = result.current;
    expect(first).toMatchObject({ word: "friren", start: 0, end: 6 });
    rerender({ query: "friren nar" });
    expect(result.current).toBe(first);
    expect(result.current).toMatchObject({
      word: "friren",
      spans: [{ start: 0, end: 6, word: "friren" }],
    });
  });

  it("shifts an untouched highlight when typing before the word", () => {
    const history = ["frieren"];
    const { result, rerender } = renderHook(({ query }) => useSpellCheck(query, { history }), {
      initialProps: { query: "friren" },
    });
    settle();
    rerender({ query: "x friren" });
    expect(result.current).toMatchObject({
      word: "friren",
      spans: [{ start: 2, end: 8, word: "friren" }],
    });
  });

  it("drops the highlight as soon as the flagged word itself is edited", () => {
    const history = ["frieren"];
    const { result, rerender } = renderHook(({ query }) => useSpellCheck(query, { history }), {
      initialProps: { query: "friren" },
    });
    settle();
    expect(result.current).not.toBeNull();
    rerender({ query: "frien" });
    expect(result.current).toBeNull();
  });

  it("does not flag a roman numeral season suffix", () => {
    const history = ["frieren iii"];
    const { result } = renderHook(() => useSpellCheck("frieren ii", { history }));
    settle();
    expect(result.current).toBeNull();
  });

  it("drops the highlight when a letter is appended straight to the word", () => {
    const history = ["frieren"];
    const { result, rerender } = renderHook(({ query }) => useSpellCheck(query, { history }), {
      initialProps: { query: "friren" },
    });
    settle();
    rerender({ query: "frirenx" });
    expect(result.current).toBeNull();
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
