import { beforeEach, describe, expect, it } from "vitest";

import { useAniListNotificationsStore } from "@/store/anilist.store";

beforeEach(() => {
  useAniListNotificationsStore.setState({
    initialized: false,
    observations: {},
    releases: [],
    readNotificationIds: [],
    knownListNames: [],
  });
});

describe("release feed", () => {
  it("prepends new releases unread", () => {
    const store = useAniListNotificationsStore.getState();
    store.addRelease({ mediaId: 1, title: "A", episode: 5, airedAt: 100 });
    store.addRelease({ mediaId: 2, title: "B", episode: 1, airedAt: 200 });
    const { releases } = useAniListNotificationsStore.getState();
    expect(releases.map((r) => r.mediaId)).toEqual([2, 1]);
    expect(releases.every((r) => r.read === false)).toBe(true);
  });

  it("dedupes by media and episode", () => {
    const store = useAniListNotificationsStore.getState();
    store.addRelease({ mediaId: 1, title: "A", episode: 5, airedAt: 100 });
    store.addRelease({ mediaId: 1, title: "A", episode: 5, airedAt: 200 });
    store.addRelease({ mediaId: 1, title: "A", episode: 6, airedAt: 300 });
    expect(useAniListNotificationsStore.getState().releases).toHaveLength(2);
  });

  it("marks all releases read", () => {
    const store = useAniListNotificationsStore.getState();
    store.addRelease({ mediaId: 1, title: "A", episode: 5, airedAt: 100 });
    store.markReleasesRead();
    expect(
      useAniListNotificationsStore.getState().releases.every((r) => r.read === true)
    ).toBe(true);
  });

  it("tracks site notification reads without duplicates", () => {
    const store = useAniListNotificationsStore.getState();
    store.markSiteNotificationsRead([3, 1, 3]);
    store.markSiteNotificationsRead([1, 2]);
    expect(useAniListNotificationsStore.getState().readNotificationIds).toEqual([3, 1, 2]);
  });
});
