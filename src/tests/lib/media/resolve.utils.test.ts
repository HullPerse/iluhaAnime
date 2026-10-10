import { describe, expect, it } from "vitest";

import { resolveMediaFile } from "@/lib/media/resolve.utils";

describe("resolveMediaFile western", () => {
  it("parses S01E01 with episode title", () => {
    expect(
      resolveMediaFile(
        "Adventure Time Fionna & Cake",
        "Adventure Time Fionna & Cake S01E01 Fionna Campbell.mkv"
      )
    ).toMatchObject({
      title: "Adventure Time Fionna & Cake",
      season: 1,
      episode: { number: 1, title: "Fionna Campbell" },
    });
  });

  it("keeps 4-digit episode titles out of year", () => {
    expect(
      resolveMediaFile(
        "Movies/Loki.S02.DSNP.WEB-DL.1080p.by.AKTEP",
        "Loki.S02E03.1893.DSNP.WEB-DL.1080p.by.AKTEP.mkv"
      )
    ).toMatchObject({
      title: "Loki",
      season: 2,
      episode: { number: 3, title: "1893" },
      source: "WEB-DL",
      groups: ["AKTEP"],
    });
  });

  it("parses dotted lowercase season markers", () => {
    const parsed = resolveMediaFile(
      "Movies/Peaky Blinders s01 RGzsRutracker",
      "Peaky.Blinders.s01e03.Rus.AlexFilm.BDRemux.1080i.RGzsRutracker.mkv"
    );
    expect(parsed).toMatchObject({ title: "Peaky Blinders", season: 1, episode: { number: 3 } });
    expect(parsed.groups).toContain("RGzsRutracker");
    expect(parsed.lang).toContain("rus");
  });

  it("reads year as year for movies", () => {
    expect(
      resolveMediaFile("Movies", "Barbie.2023.1080p.WEBRip.x264-Delia_EniaHD.mkv")
    ).toMatchObject({ title: "Barbie", year: 2023, kind: "movie", episode: {} });
  });

  it("keeps leading numbers that belong to the title", () => {
    expect(
      resolveMediaFile("Movies", "12.Years.a.Slave.2013.1080p.BluRay.2xRus.Eng.-HQCLUB.mkv")
    ).toMatchObject({ title: "12 Years a Slave", year: 2013, kind: "movie" });
  });

  it("keeps trailing roman numerals in movie titles", () => {
    expect(resolveMediaFile("Movies", "Tochno Ne Ampir V.mkv")).toMatchObject({
      title: "Tochno Ne Ampir V",
      kind: "movie",
      episode: {},
    });
  });

  it("trims junk trailing letters", () => {
    expect(resolveMediaFile("Movies", "The.Man.Who.Knew.Infinity.D.BDRip.1080p.mkv")).toMatchObject(
      { title: "The Man Who Knew Infinity", kind: "movie" }
    );
  });
});

describe("resolveMediaFile anime brackets", () => {
  it("strips season suffixes from the title", () => {
    expect(
      resolveMediaFile(
        "Anime/Boku.no.Hero.Academia.Illegals.S2.WEB-DL.1080p",
        "[BudLightSubs] Boku no Hero Academia Illegals S2 - 01 [1080p].mkv"
      )
    ).toMatchObject({ title: "Boku no Hero Academia Illegals", season: 2, episode: { number: 1 } });
  });

  it("keeps every ampersand group", () => {
    const parsed = resolveMediaFile(
      "Anime/Boogiepop wa Warawanai [BDRip 720p]",
      "[SweetSub&VCB-Studio] Boogiepop Phantom [01][Ma10p_720p][x265_ac3].mkv"
    );
    expect(parsed.groups).toEqual(["SweetSub", "VCB-Studio"]);
    expect(parsed).toMatchObject({ title: "Boogiepop Phantom", episode: { number: 1 } });
  });

  it("parses compact S-P-E notation with part", () => {
    expect(
      resolveMediaFile(
        "Anime/[SOFCJ-Raws] Shingeki no Kyojin - Season 3 - Part 1 [WEB-DL KP 1080p]",
        "[SOFCJ-Raws] Shingeki no Kyojin - S3 - P1 - E01 [WEB-DL KP 1080p].mkv"
      )
    ).toMatchObject({ title: "Shingeki no Kyojin", season: 3, part: 1, episode: { number: 1 } });
  });

  it("splits arcs into title plus arc", () => {
    expect(
      resolveMediaFile(
        "Anime/[Moozzi2] Kimetsu no Yaiba - Hashira Geiko-hen [BDRip 1080p x265 FLAC]",
        "[Moozzi2] Kimetsu no Yaiba - Hashira Geiko-hen - 01 [BDRip 1080p x265 FLAC].mkv"
      )
    ).toMatchObject({
      title: "Kimetsu no Yaiba",
      arc: "Hashira Geiko-hen",
      searchTitle: "Kimetsu no Yaiba: Hashira Geiko-hen",
      episode: { number: 1 },
    });
  });

  it("joins prefix titles with a colon for search", () => {
    expect(
      resolveMediaFile(
        "Anime/Boku.no.Hero.Academia.Illegals.WEB-DL.1080p",
        "[Erai-raws] Vigilante - Boku no Hero Academia Illegals - 01 [1080p].mkv"
      )
    ).toMatchObject({
      title: "Boku no Hero Academia Illegals",
      searchTitle: "Vigilante: Boku no Hero Academia Illegals",
      episode: { number: 1 },
    });
  });

  it("reads underscore episode counters", () => {
    expect(
      resolveMediaFile(
        "Anime/[AniDub]_Kaiba_TV_[ru_jp]_[1280x720_h264_aac]_[eNd]",
        "[AniDub]_Kaiba_TV_[06_of_12]_[ru_jp]_[1280x720_h264_aac]_[eNd].mkv"
      )
    ).toMatchObject({
      title: "Kaiba",
      episode: { number: 6, ofTotal: 12 },
      lang: ["rus", "jpn"],
    });
  });

  it("recovers titles hidden in all-bracket names", () => {
    expect(
      resolveMediaFile(
        "Anime/[Kekkai Sensen][BDRIP][1080P]",
        "[Kekkai Sensen][01][BDRIP][1080P][H264_FLAC].mkv"
      )
    ).toMatchObject({ title: "Kekkai Sensen", episode: { number: 1 }, source: "BDRIP" });
  });

  it("reads specials without episode numbers", () => {
    expect(
      resolveMediaFile(
        "Anime/Majo to Yajuu TV-1 [anidb2-17575]/Specials",
        "Majo to Yajuu TV-1 ED (BDRip 1920x1080 x264 FLAC).mkv"
      )
    ).toMatchObject({ title: "Majo to Yajuu", kind: "special", special: "ED", episode: {} });
  });
});

describe("resolveMediaFile russian numbering", () => {
  it("parses ranges with titles from the folder", () => {
    expect(
      resolveMediaFile("Anime/Inuyasha", "133-134. Женщина, что полюбила Сещемару.mkv")
    ).toMatchObject({
      title: "Inuyasha",
      episode: { number: 133, numberAlt: 134, title: "Женщина, что полюбила Сещемару" },
    });
  });

  it("parses single numbers glued to the title", () => {
    expect(resolveMediaFile("Anime/Inuyasha", "118. В недрах горы Хакурей.mkv")).toMatchObject({
      title: "Inuyasha",
      episode: { number: 118, title: "В недрах горы Хакурей" },
    });
  });
});

describe("resolveMediaFile sidecars", () => {
  it("parses studio dub tracks", () => {
    const parsed = resolveMediaFile(
      "Anime/Dandadan [WEB-DL CR 1080p AVC DDP]/RUS Sound/AniLibria",
      "Dandadan - 01 [WEB-DL CR 1080p AVC DDP].AniLibria.mka"
    );
    expect(parsed).toMatchObject({ title: "Dandadan", episode: { number: 1 } });
    expect(parsed.sidecar).toMatchObject({ kind: "audio", studio: "AniLibria" });
  });

  it("parses russian full subtitle tracks", () => {
    const parsed = resolveMediaFile(
      "Anime/Dandadan [WEB-DL CR 1080p AVC DDP]/RUS Subs",
      "Dandadan - 01 [WEB-DL CR 1080p AVC DDP].CR.полные.rus.ass"
    );
    expect(parsed).toMatchObject({ title: "Dandadan", episode: { number: 1 } });
    expect(parsed.sidecar).toMatchObject({ kind: "subs", origin: "CR", lang: ["rus"] });
  });

  it("reads sequel numbers as sequels, not episodes", () => {
    expect(resolveMediaFile("Anime", "Luo Xiao Hei Zhanji 2 [BDRip 1080p HEVC].mkv")).toMatchObject(
      {
        title: "Luo Xiao Hei Zhanji",
        sequel: 2,
        kind: "movie",
        episode: {},
      }
    );
  });
});

describe("resolveMediaFile rutracker folder vocabulary", () => {
  it("reads an explicit Cyrillic TV season over TV-plus-count", () => {
    expect(
      resolveMediaFile("Anime/Show (ТВ-2) [TV] [12 из 12]", "Show - 01 [WEB-DL 1080p].mkv")
    ).toMatchObject({
      title: "Show",
      season: 2,
      episode: { number: 1, ofTotal: 12 },
    });
  });

  it("reads bare resolutions inside tech brackets", () => {
    expect(resolveMediaFile("Anime", "Show - 01 [WEB-DL 1080 AAC].mkv")).toMatchObject({
      title: "Show",
      episode: { number: 1 },
      resolution: "1080",
    });
  });

  it("reads compact lang pairs like JAP+Sub", () => {
    expect(
      resolveMediaFile("Anime/[RUS(int), JAP+Sub]", "Show - 01 [1080p].mkv")
    ).toMatchObject({
      title: "Show",
      lang: ["rus", "jpn"],
    });
  });

  it("reads years glued to commas in brackets", () => {
    expect(resolveMediaFile("Anime/[2026, WEB-DL]", "Show - 01 [1080p].mkv")).toMatchObject({
      title: "Show",
      year: 2026,
    });
  });

  it("surfaces subtitle markers from the folder", () => {
    expect(
      resolveMediaFile("Anime/[RUS(int), JAP+Sub]", "Show - 01 [1080p].mkv")
    ).toMatchObject({
      title: "Show",
      subs: ["sub"],
    });
  });
});
