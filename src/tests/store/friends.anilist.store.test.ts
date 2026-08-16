import { beforeEach, describe, expect, it } from "vitest";

import { useAniListFriendsStore } from "@/store/anilist.store";

const friend = {
  avatar: "https://example.test/avatar.jpg",
  id: 42,
  name: "Sakura",
};

beforeEach(() => {
  useAniListFriendsStore.setState({ friends: [] });
});

describe("useAniListFriendsStore", () => {
  it("starts with an empty list", () => {
    expect(useAniListFriendsStore.getState().friends).toEqual([]);
  });

  it("adds a friend with a timestamp", () => {
    useAniListFriendsStore.getState().addFriend(friend);

    expect(useAniListFriendsStore.getState().friends).toEqual([
      expect.objectContaining({ ...friend }),
    ]);
    expect(
      useAniListFriendsStore.getState().friends[0].added_at
    ).toBeGreaterThan(0);
  });

  it("updates an existing friend instead of duplicating it", () => {
    useAniListFriendsStore.getState().addFriend(friend);
    useAniListFriendsStore.getState().addFriend({
      ...friend,
      avatar: null,
      name: "Sakura Updated",
    });

    expect(useAniListFriendsStore.getState().friends).toHaveLength(1);
    expect(useAniListFriendsStore.getState().friends[0]).toMatchObject({
      avatar: null,
      id: friend.id,
      name: "Sakura Updated",
    });
  });

  it("caches the full profile without creating another friend", () => {
    useAniListFriendsStore.getState().addFriend(friend);
    useAniListFriendsStore.getState().cacheProfile({
      ...friend,
      about: "A profile",
      anime_count: 12,
      banner_image: null,
      episodes_watched: 34,
      is_follower: false,
      is_following: true,
      mean_score: 78,
    });

    const saved = useAniListFriendsStore.getState().friends[0];
    expect(useAniListFriendsStore.getState().friends).toHaveLength(1);
    expect(saved.profile?.about).toBe("A profile");
    expect(saved.profile_fetched_at).toBeGreaterThan(0);
  });

  it("removes a friend by AniList id", () => {
    useAniListFriendsStore.getState().addFriend(friend);
    useAniListFriendsStore.getState().addFriend({
      avatar: null,
      id: 7,
      name: "Momo",
    });

    useAniListFriendsStore.getState().removeFriend(friend.id);

    expect(
      useAniListFriendsStore.getState().friends.map((item) => item.id)
    ).toEqual([7]);
  });
});
