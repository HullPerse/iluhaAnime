import { beforeEach, describe, expect, it } from "vitest";

import { useDeepLinkStore } from "@/store/deeplink.store";

beforeEach(() => {
  useDeepLinkStore.setState({ target: null });
});

describe("useDeepLinkStore", () => {
  it("opens a link target", () => {
    useDeepLinkStore.getState().openAnime({ id: 21, source: "anilist" });
    expect(useDeepLinkStore.getState().target).toEqual({ id: 21, source: "anilist" });
  });

  it("replaces the previous target", () => {
    useDeepLinkStore.getState().openAnime({ id: 21, source: "anilist" });
    useDeepLinkStore.getState().openAnime({ id: 5114, source: "anilist" });
    expect(useDeepLinkStore.getState().target?.id).toBe(5114);
  });

  it("consume clears the target", () => {
    useDeepLinkStore.getState().openAnime({ id: 21, source: "anilist" });
    useDeepLinkStore.getState().consume();
    expect(useDeepLinkStore.getState().target).toBeNull();
  });

  it("consume on empty stays empty", () => {
    useDeepLinkStore.getState().consume();
    expect(useDeepLinkStore.getState().target).toBeNull();
  });
});
