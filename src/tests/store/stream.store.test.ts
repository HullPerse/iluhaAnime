import { beforeEach, describe, expect, it, vi } from "vitest";

const SOURCE_KEY = "iluha.v1.stream-source";

async function loadStore() {
  return import("@/store/stream.store");
}

describe("stream source persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("restores the last selected source after a restart", async () => {
    const first = await loadStore();
    first.selectStreamSource("allanime");
    expect(localStorage.getItem(SOURCE_KEY)).toBe("allanime");

    vi.resetModules();
    const restarted = await loadStore();

    expect(restarted.streamSource.get()).toBe("allanime");
  });

  it("falls back to AnimeLib for an unknown stored value", async () => {
    localStorage.setItem(SOURCE_KEY, "removed-source");

    const store = await loadStore();

    expect(store.streamSource.get()).toBe("animelib");
  });

  it("resets the catalog view when the source changes", async () => {
    const store = await loadStore();
    store.submitStreamSearch("frieren");
    store.streamPage.set(3);

    store.selectStreamSource("allanime");

    expect(store.streamQuery.get()).toBe("");
    expect(store.streamPage.get()).toBe(1);
    expect(store.streamSlug.get()).toBeNull();
  });
});
