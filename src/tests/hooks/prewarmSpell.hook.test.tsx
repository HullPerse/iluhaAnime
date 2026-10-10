import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePrewarmSpellIndex } from "@/hooks/search/animeIndex.hook";
import { searchAtoms } from "@/store/search.store";
import { settingsAtoms } from "@/store/settings.store";
import type { SearchAnimeSuggestion } from "@/types/search";

const STORAGE_KEY = "iluha.v1.spellindex";

function anime(title: string): SearchAnimeSuggestion {
  return {
    id: 1,
    title,
    aliases: [],
    status: "COMPLETED",
    season: null,
    seasonYear: null,
    score: null,
    favourite: false,
  };
}

function flushIdle(): void {
  act(() => {
    vi.advanceTimersByTime(2000);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  searchAtoms.history.set([]);
  searchAtoms.animeIndex.set([anime("Frieren: Beyond Journey's End")]);
  settingsAtoms.searchSymSpellEnabled.set(true);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("usePrewarmSpellIndex", () => {
  it("persists the built word list once the idle slices finish", () => {
    renderHook(() => usePrewarmSpellIndex());
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    flushIdle();
    expect(localStorage.getItem(STORAGE_KEY)).toContain("frieren");
  });

  it("stays idle while the symspell setting is off", () => {
    settingsAtoms.searchSymSpellEnabled.set(false);
    renderHook(() => usePrewarmSpellIndex());
    flushIdle();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("cancels the pending build on unmount", () => {
    const { unmount } = renderHook(() => usePrewarmSpellIndex());
    unmount();
    flushIdle();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
