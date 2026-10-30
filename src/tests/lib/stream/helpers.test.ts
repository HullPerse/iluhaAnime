import { describe, expect, it } from "vitest";

import {
  buildVariantId,
  buildWatchKey,
  isSubtitleVariant,
  normalizeAnime,
  normalizeEpisode,
  normalizeVariant,
} from "@/lib/stream/helpers";
import {
  pickSource,
  qualityRank,
  sortSourcesByQuality,
  toVariantSources,
  variantSourceUrl,
} from "@/lib/stream/sources.utils";
import type { StreamSource } from "@/types/videoPlayer";

function source(url: string, label: string): StreamSource {
  return {
    variantId: "Kodik:32416",
    quality: label.replace("p", ""),
    label,
    url,
    type: "m3u8",
    headers: {},
    subtitles: [],
    audioTracks: [],
  };
}

describe("stream identity", () => {
  it("builds a variant id from the hoster and the team", () => {
    expect(
      buildVariantId({
        id: "32416",
        name: "AniDUB",
        separateStream: true,
        player: "Kodik",
        sourceUrl: "//kodikplayer.com/seria/1/hash/720p",
      })
    ).toBe("Kodik:32416");
  });

  it("builds a watch key that never contains the media url", () => {
    const key = buildWatchKey("animelib", "11", "455");
    expect(key).toBe("stream:animelib:11:455");
    expect(key).not.toContain("http");
  });
});

describe("stream variant kind", () => {
  it("reads the subtitle kind from the label or the team", () => {
    expect(
      isSubtitleVariant(
        normalizeVariant({ id: "1", name: "AniRise", language: "Субтитры", player: "Kodik" })
      )
    ).toBe(true);
    expect(
      isSubtitleVariant(
        normalizeVariant({ id: "2", name: "Crunchyroll.Subtitles", player: "Kodik" })
      )
    ).toBe(true);
  });

  it("keeps voice-overs out of the subtitle group", () => {
    expect(
      isSubtitleVariant(
        normalizeVariant({ id: "3", name: "AniDUB", language: "Озвучка", player: "Kodik" })
      )
    ).toBe(false);
    expect(
      isSubtitleVariant(normalizeVariant({ id: "4", name: "Studio Band", player: "Kodik" }))
    ).toBe(false);
  });
});

describe("stream normalization", () => {
  it("fills every optional anime field with a safe default", () => {
    const anime = normalizeAnime({ id: "11", title: "Naruto" });
    expect(anime.synonyms).toEqual([]);
    expect(anime.genres).toEqual([]);
    expect(anime.slugUrl).toBe("");
    expect(anime.anilistId).toBeUndefined();
  });

  it("keeps the fields a card and a player need", () => {
    const anime = normalizeAnime({
      id: "11",
      title: "Naruto",
      year: 2002,
      status: "Завершён",
      anilistId: 20,
      slugUrl: "11--naruto-anime",
    });
    expect(anime.year).toBe(2002);
    expect(anime.status).toBe("Завершён");
    expect(anime.anilistId).toBe(20);
    expect(anime.slugUrl).toBe("11--naruto-anime");
  });

  it("keeps the rating and the media type from the list answer", () => {
    const anime = normalizeAnime({
      id: "1",
      title: "Sousou no Frieren",
      rating: 9.36,
      ratingVotes: 9753,
      mediaType: "TV Сериал",
      ageRating: "PG-13",
      views: 489421,
    });
    expect(anime.rating).toBe(9.36);
    expect(anime.ratingVotes).toBe(9753);
    expect(anime.mediaType).toBe("TV Сериал");
    expect(anime.ageRating).toBe("PG-13");
    expect(anime.views).toBe(489421);
  });

  it("normalizes an episode without a name", () => {
    const episode = normalizeEpisode({ id: "455", number: 1 });
    expect(episode.number).toBe(1);
    expect(episode.title).toBeUndefined();
    expect(episode.airDate).toBeUndefined();
  });

  it("normalizes a player row", () => {
    const variant = normalizeVariant({
      id: "32416",
      name: "AniDUB",
      language: "Озвучка",
      player: "Kodik",
      sourceUrl: "//kodikplayer.com/seria/1/hash/720p",
    });
    expect(variant.separateStream).toBe(false);
    expect(variant.language).toBe("Озвучка");
    expect(buildVariantId(variant)).toBe("Kodik:32416");
  });
});

describe("stream quality selection", () => {
  it("ranks labels by their digits", () => {
    expect(qualityRank("1080p")).toBeGreaterThan(qualityRank("720p"));
    expect(qualityRank("unknown")).toBe(0);
  });

  it("sorts the best quality first", () => {
    const sorted = sortSourcesByQuality([
      source("https://cdn/360.m3u8", "360p"),
      source("https://cdn/1080.m3u8", "1080p"),
      source("https://cdn/720.m3u8", "720p"),
    ]);
    expect(sorted.map((item) => item.label)).toEqual(["1080p", "720p", "360p"]);
  });

  it("falls back down to the nearest lower quality", () => {
    const sources = [
      source("https://cdn/360.m3u8", "360p"),
      source("https://cdn/720.m3u8", "720p"),
    ];
    expect(pickSource(sources, "1080p")?.url).toBe("https://cdn/720.m3u8");
    expect(pickSource(sources, "360p")?.url).toBe("https://cdn/360.m3u8");
    expect(pickSource([], "720p")).toBeNull();
  });

  it("never jumps above the requested quality", () => {
    const sources = [
      source("https://cdn/2160.m3u8", "2160p"),
      source("https://cdn/1080.m3u8", "1080p"),
      source("https://cdn/720.m3u8", "720p"),
    ];
    expect(pickSource(sources, "1440p")?.label).toBe("1080p");
  });

  it("takes the lowest source when nothing is lower than the request", () => {
    const sources = [
      source("https://cdn/2160.m3u8", "2160p"),
      source("https://cdn/720.m3u8", "720p"),
    ];
    expect(pickSource(sources, "480p")?.label).toBe("720p");
  });

  it("plays the best source without a preference or with an unreadable one", () => {
    const sources = [
      source("https://cdn/2160.m3u8", "2160p"),
      source("https://cdn/720.m3u8", "720p"),
    ];
    expect(pickSource(sources)?.label).toBe("2160p");
    expect(pickSource(sources, "best")?.label).toBe("2160p");
  });

  it("hands the player a sorted quality list", () => {
    const variants = toVariantSources([
      source("https://cdn/360.m3u8", "360p"),
      source("https://cdn/1080.m3u8", "1080p"),
    ]);
    expect(variants.map((item) => item.label)).toEqual(["1080p", "360p"]);
    expect(variantSourceUrl(variants, "1080p")).toBe("https://cdn/1080.m3u8");
    expect(variantSourceUrl(variants, "720p")).toBeNull();
  });
});
