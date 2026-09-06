import { describe, expect, it } from "vitest";

import { createLruCache } from "@/lib/utils/lruCache.utils";

describe("createLruCache", () => {
  it("stores and returns values", () => {
    const cache = createLruCache<string, number>(2);
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
    expect(cache.peek("a")).toBe(1);
    expect(cache.has("a")).toBe(true);
  });

  it("returns undefined and counts a miss for absent keys", () => {
    const cache = createLruCache<string, number>(2);
    expect(cache.get("missing")).toBeUndefined();
    const stats = cache.stats();
    expect(stats.misses).toBe(1);
    expect(stats.hits).toBe(0);
  });

  it("evicts the least-recently-used entry when full", () => {
    const cache = createLruCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.has("a")).toBe(false);
    expect(cache.has("b")).toBe(true);
    expect(cache.has("c")).toBe(true);
    expect(cache.stats().evictions).toBe(1);
  });

  it("keeps a touched entry over an untouched one", () => {
    const cache = createLruCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a");
    cache.set("c", 3);
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
  });

  it("counts hits and misses across the cache lifetime", () => {
    const cache = createLruCache<string, number>(2);
    cache.set("a", 1);
    cache.get("a");
    cache.get("a");
    cache.get("b");
    const stats = cache.stats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.size).toBe(1);
    expect(stats.capacity).toBe(2);
  });

  it("replaces the value without evicting when the key exists", () => {
    const cache = createLruCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("a", 10);
    expect(cache.get("a")).toBe(10);
    expect(cache.has("b")).toBe(true);
    expect(cache.stats().evictions).toBe(0);
  });

  it("delete and clear remove entries", () => {
    const cache = createLruCache<string, number>(2);
    cache.set("a", 1);
    expect(cache.delete("a")).toBe(true);
    expect(cache.delete("a")).toBe(false);
    cache.set("b", 2);
    cache.clear();
    expect(cache.stats().size).toBe(0);
    expect(cache.has("b")).toBe(false);
  });

  it("treats capacity below 1 as 1", () => {
    const cache = createLruCache<string, number>(0);
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.has("a")).toBe(false);
    expect(cache.has("b")).toBe(true);
  });
});
