import { beforeEach, describe, expect, it, vi } from "vitest";

import { anilistApi } from "@/api/anilist.api";
import { loadFriendScores } from "@/lib/anilist/friends.utils";
import type { FriendScore } from "@/types/anilist";

function makeFriend(id: number, name: string): FriendScore {
  return {
    id,
    name,
    avatar: null,
    score: null,
    scoreFormat: null,
    status: "",
    comment: null,
    repeat: null,
    progress: null,
    episodes: null,
  };
}

const FRIENDS = [makeFriend(7, "Ana"), makeFriend(9, "Bo")];

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("loadFriendScores", () => {
  it("asks the backend once for every friend", async () => {
    const spy = vi.spyOn(anilistApi, "getFriendScores").mockResolvedValue([]);
    await loadFriendScores(501, FRIENDS);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(501, [7, 9]);
  });

  it("keeps the friend identity and maps the entry", async () => {
    vi.spyOn(anilistApi, "getFriendScores").mockResolvedValue([
      {
        userId: 9,
        score: 85,
        scoreFormat: "POINT_100",
        status: "COMPLETED",
        progress: 24,
        repeat: 1,
        notes: "  great  ",
        episodes: 24,
      },
    ]);
    const rows = await loadFriendScores(501, FRIENDS);
    expect(rows).toEqual([
      {
        ...FRIENDS[1],
        score: 85,
        scoreFormat: "POINT_100",
        status: "COMPLETED",
        comment: "great",
        repeat: 1,
        progress: 24,
        episodes: 24,
      },
    ]);
  });

  it("drops blank comments and unknown users", async () => {
    vi.spyOn(anilistApi, "getFriendScores").mockResolvedValue([
      {
        userId: 7,
        score: null,
        scoreFormat: null,
        status: "CURRENT",
        progress: null,
        repeat: null,
        notes: "   ",
        episodes: null,
      },
      {
        userId: 404,
        score: 5,
        scoreFormat: "POINT_10",
        status: "COMPLETED",
        progress: 1,
        repeat: null,
        notes: null,
        episodes: 1,
      },
    ]);
    const rows = await loadFriendScores(501, FRIENDS);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(7);
    expect(rows[0]?.comment).toBeNull();
    expect(rows[0]?.score).toBeNull();
  });

  it("does not call the backend without friends", async () => {
    const spy = vi.spyOn(anilistApi, "getFriendScores").mockResolvedValue([]);
    expect(await loadFriendScores(501, [])).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});
