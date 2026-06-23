import { describe, it, expect, beforeEach } from "vitest";
import { saveSearchQuery, getSearchHistory } from "./storage";

const store: Record<string, string> = {};

beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k]);
});

Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      Object.keys(store).forEach((k) => delete store[k]);
    },
  },
  configurable: true,
});

describe("search history", () => {
  it("saves and retrieves queries", () => {
    saveSearchQuery("Naruto");
    const history = getSearchHistory();
    expect(history).toContain("naruto");
  });

  it("deduplicates queries", () => {
    saveSearchQuery("Naruto");
    saveSearchQuery("naruto");
    const history = getSearchHistory();
    expect(history.filter((h) => h === "naruto")).toHaveLength(1);
  });

  it("limits history size", () => {
    for (let i = 0; i < 30; i++) saveSearchQuery(`query-${i}`);
    expect(getSearchHistory().length).toBeLessThanOrEqual(5);
  });
});
