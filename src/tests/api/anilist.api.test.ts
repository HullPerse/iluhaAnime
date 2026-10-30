import { beforeEach, describe, expect, it } from "vitest";

import { AnilistApi } from "@/api/anilist.api";
import type { ApiTransport } from "@/types/core/transport";
import { patchSettings, settingsAtoms } from "@/store/settings.store";

function fakeTransport(resolve: (command: string, args?: Record<string, unknown>) => unknown) {
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  const transport: ApiTransport = {
    call: async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
      calls.push({ command, args });
      return resolve(command, args) as T;
    },
  };
  return { calls, transport };
}

beforeEach(() => {
  patchSettings({ anilistProxyUrl: null });
});

describe("AnilistApi", () => {
  it("injects the configured proxy into every call", async () => {
    patchSettings({ anilistProxyUrl: "socks5://127.0.0.1:10808" });
    const { calls, transport } = fakeTransport(() => []);
    const api = new AnilistApi({
      transport,
      proxyUrl: () => settingsAtoms.anilistProxyUrl.get(),
    });

    await api.getLists(7);

    expect(calls).toEqual([
      {
        command: "get_anilist_lists",
        args: {
          userId: 7,
          minimal: false,
          proxyUrl: "socks5://127.0.0.1:10808",
          proxy_url: "socks5://127.0.0.1:10808",
        },
      },
    ]);
  });

  it("asks for the statistics of one user in one call", async () => {
    const { calls, transport } = fakeTransport(() => ({ count: 0 }));
    const api = new AnilistApi({ transport });

    await api.getStatistics(7);

    expect(calls).toEqual([
      {
        command: "get_anilist_statistics",
        args: { userId: 7 },
      },
    ]);
  });

  it("asks for every friend score in one call", async () => {
    const { calls, transport } = fakeTransport(() => []);
    const api = new AnilistApi({ transport });

    await api.getFriendScores(501, [7, 9]);

    expect(calls[0]).toMatchObject({
      command: "get_anilist_friend_scores",
      args: { mediaId: 501, userIds: [7, 9] },
    });
  });

  it("sends both id casings when saving an entry", async () => {
    const { calls, transport } = fakeTransport(() => undefined);
    const api = new AnilistApi({ transport });

    await api.saveEntry({ mediaId: 21, status: "CURRENT", progress: 3, score: null, notes: null });

    expect(calls[0]).toMatchObject({
      command: "save_anilist_entry",
      args: { media_id: 21, mediaId: 21, status: "CURRENT", progress: 3 },
    });
  });

  it("forwards repeat, privacy flags and dates when saving an entry", async () => {
    const { calls, transport } = fakeTransport(() => undefined);
    const api = new AnilistApi({ transport });

    await api.saveEntry({
      mediaId: 21,
      status: "COMPLETED",
      progress: 24,
      score: 9,
      notes: null,
      repeat: 2,
      private: true,
      hiddenFromStatusLists: false,
      startedAt: "2023-05-02",
      completedAt: "2024-03-09",
    });

    expect(calls[0]).toMatchObject({
      command: "save_anilist_entry",
      args: {
        media_id: 21,
        repeat: 2,
        private: true,
        hiddenFromStatusLists: false,
        startedAt: "2023-05-02",
        completedAt: "2024-03-09",
      },
    });
  });

  it("sends both id casings when deleting an entry", async () => {
    const { calls, transport } = fakeTransport(() => true);
    const api = new AnilistApi({ transport });

    await api.deleteEntry(21, 7);

    expect(calls[0]).toMatchObject({
      command: "delete_anilist_entry",
      args: { media_id: 21, mediaId: 21, user_id: 7, userId: 7 },
    });
  });

  it("asks for a following page with user and pagination", async () => {
    const { calls, transport } = fakeTransport(() => ({
      users: [],
      has_next_page: false,
    }));
    const api = new AnilistApi({ transport });

    await api.getFollowing(7, 2, 25);

    expect(calls[0]).toMatchObject({
      command: "get_anilist_following",
      args: { userId: 7, page: 2, perPage: 25 },
    });
  });

  it("trims the login token", async () => {
    const { calls, transport } = fakeTransport(() => ({ id: 1, name: "u" }));
    const api = new AnilistApi({ transport });

    await api.login("  abc  ");

    expect(calls[0]).toMatchObject({ command: "anilist_login" });
    expect(calls[0]?.args).toMatchObject({ token: "abc" });
  });

  it("fetches the full detail bundle in one call", async () => {
    const { calls, transport } = fakeTransport(() => ({}));
    const api = new AnilistApi({ transport });

    await api.getAnimeFull(21);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ command: "get_anime_full", args: { id: 21 } });
  });

  it("fetches only the trailer in one call", async () => {
    const { calls, transport } = fakeTransport(() => "youtube-id");
    const api = new AnilistApi({ transport });

    await api.getAnimeTrailer(21);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ command: "get_anime_trailer", args: { id: 21 } });
  });

  it("asks for every detail id in one call", async () => {
    const ids = [21, 22, 23];
    const { calls, transport } = fakeTransport(() => []);
    const api = new AnilistApi({ transport });

    await api.getAnimeByIds(ids);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ command: "get_anime_by_ids", args: { ids } });
  });

  it("fetches the franchise graph in one call with scope", async () => {
    const { calls, transport } = fakeTransport(() => ({}));
    const api = new AnilistApi({ transport });

    await api.getAnimeFranchise(21, "all");

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      command: "get_anime_franchise",
      args: { id: 21, scope: "all" },
    });
  });
});
