import { describe, expect, it } from "vitest";

import {
  anilistAnimeUrl,
  anilistProfileUrl,
  anilistSearchUrl,
  buildDetailActivity,
  buildIdleActivity,
  buildPlayerActivity,
  buildSearchActivity,
  presenceText,
  samePresence,
} from "@/lib/utils/presence.utils";
import type { DiscordActivity } from "@/types/discord";
import type { TFunc, TranslationKey, TranslationVariables } from "@/types/i18n";
import type { StreamOpen } from "@/types/videoPlayer";

const MESSAGES: Partial<Record<TranslationKey, (variables?: TranslationVariables) => string>> = {
  "discord.button.anilist": () => "View on AniList",
  "discord.button.profile": () => "AniList profile",
  "discord.button.search": () => "Find on AniList",
  "discord.detail.state": () => "Browsing AniList",
  "discord.idle.library": (variables) => `${variables?.titles} anime`,
  "discord.idle.running": () => "iluhaAnime is running",
  "discord.player.paused": () => "Paused",
  "discord.search.details": () => "Searching anime",
  "player.title.episode": (variables) => `Episode ${variables?.n}`,
  "player.title.episode.colon": (variables) => `Episode: ${variables?.title}`,
  "player.title.season": (variables) => `Season ${variables?.n}`,
};

const t: TFunc = (key, variables) => MESSAGES[key]?.(variables) ?? key;

const user = {
  name: "hull",
  anime_count: 120,
};

const stream: StreamOpen = {
  sourceId: "source",
  sourceName: "Source",
  mediaId: "media",
  mediaTitle: "Sousou no Frieren",
  episodeId: "episode",
  episodeNumber: 12,
  episodeTitle: "",
  anilistId: 52991,
  watchKey: "watch",
  headers: {},
  quality: "1080p",
  variantId: "variant",
  sources: [],
  mediaUrl: "https://example.test/media.m3u8",
};

describe("presence activity builders", () => {
  it("shows AniList statistics while idle", () => {
    const activity = buildIdleActivity(user, t);
    expect(activity.details).toBe("120 anime");
    expect(activity.state).toBeUndefined();
    expect(activity.buttons).toEqual([
      { label: "AniList profile", url: "https://anilist.co/user/hull" },
    ]);
  });

  it("keeps a neutral card without an AniList account", () => {
    expect(buildIdleActivity(null, t)).toEqual({ details: "iluhaAnime is running" });
  });

  it("does not send search text", () => {
    expect(buildSearchActivity(t)).toEqual({ details: "Searching anime" });
  });

  it("shows the open AniList title and a safe link", () => {
    const activity = buildDetailActivity({ id: 52991, title: "Sousou no Frieren" }, t);
    expect(activity.details).toBe("Sousou no Frieren");
    expect(activity.state).toBe("Browsing AniList");
    expect(activity.buttons?.[0].url).toBe("https://anilist.co/anime/52991");
  });
});

describe("player presence", () => {
  it("uses stream metadata and progress timestamps", () => {
    const activity = buildPlayerActivity(
      {
        stream,
        path: "",
        hasFile: true,
        paused: false,
        eofReached: false,
        duration: 1440,
        timePos: 120,
        parseTitles: true,
      },
      t,
      1_000_000
    );
    expect(activity).toMatchObject({
      details: "Sousou no Frieren",
      state: "Episode 12",
      activityType: 3,
      startTimestamp: 880_000,
      endTimestamp: 2_320_000,
    });
    expect(activity?.buttons).toEqual([
      { label: "View on AniList", url: "https://anilist.co/anime/52991" },
    ]);
  });

  it("freezes the card while paused", () => {
    const activity = buildPlayerActivity(
      {
        stream,
        path: "",
        hasFile: true,
        paused: true,
        eofReached: false,
        duration: 1440,
        timePos: 120,
        parseTitles: true,
      },
      t,
      1_000_000
    );
    expect(activity?.state).toBe("Episode 12 - Paused");
    expect(activity?.startTimestamp).toBeUndefined();
    expect(activity?.endTimestamp).toBeUndefined();
  });

  it("parses a local file and searches AniList when there is no id", () => {
    const activity = buildPlayerActivity(
      {
        stream: null,
        path: "C:/Anime/Frieren - 12.mkv",
        hasFile: true,
        paused: false,
        eofReached: false,
        duration: 1440,
        timePos: 0,
        parseTitles: true,
      },
      t,
      1_000_000
    );
    expect(activity?.details).toContain("Frieren");
    expect(activity?.state).toContain("12");
    expect(activity?.buttons?.[0].url).toContain("https://anilist.co/search/anime?search=");
  });

  it("keeps the file name when title parsing is off", () => {
    const activity = buildPlayerActivity(
      {
        stream: null,
        path: "C:/Anime/Frieren - 12.mkv",
        hasFile: true,
        paused: false,
        eofReached: false,
        duration: 1440,
        timePos: 0,
        parseTitles: false,
      },
      t,
      1_000_000
    );
    expect(activity?.details).toBe("Frieren - 12.mkv");
    expect(activity?.state).toBeUndefined();
  });

  it("returns no activity without a loaded file", () => {
    expect(
      buildPlayerActivity(
        {
          stream: null,
          path: "",
          hasFile: false,
          paused: true,
          eofReached: false,
          duration: 0,
          timePos: 0,
          parseTitles: true,
        },
        t
      )
    ).toBeNull();
  });
});

describe("presence helpers", () => {
  it("collapses whitespace and caps long text", () => {
    expect(presenceText("  a   b  ")).toBe("a b");
    expect(presenceText("x".repeat(200)).length).toBe(128);
    expect(presenceText("x".repeat(200)).endsWith("...")).toBe(true);
  });

  it("builds encoded AniList links", () => {
    expect(anilistAnimeUrl(52991)).toBe("https://anilist.co/anime/52991");
    expect(anilistProfileUrl("hull perse")).toBe("https://anilist.co/user/hull%20perse");
    expect(anilistSearchUrl("Sousou no Frieren")).toBe(
      "https://anilist.co/search/anime?search=Sousou%20no%20Frieren"
    );
  });

  it("compares activity buttons, not just text", () => {
    const first: DiscordActivity = {
      details: "Frieren",
      buttons: [{ label: "Open", url: "https://anilist.co/anime/1" }],
    };
    expect(samePresence(first, { ...first })).toBe(true);
    expect(
      samePresence(first, {
        details: "Frieren",
        buttons: [{ label: "Open", url: "https://anilist.co/anime/2" }],
      })
    ).toBe(false);
  });
});
