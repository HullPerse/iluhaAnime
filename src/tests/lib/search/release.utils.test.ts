import { describe, expect, it } from "vitest";

import { stripReleaseNoise } from "@/lib/search/release.utils";

describe("search/release noise", () => {
  const cases: Array<[input: string, clean: string]> = [
    [
      "[Moozzi2] Kimetsu no Yaiba - Hashira Geiko-hen [BDRip 1080p x265 FLAC]",
      "Kimetsu no Yaiba - Hashira Geiko-hen",
    ],
    [
      "Shingeki.no.Kyojin.Movie.Kanketsu-hen.WEB-DL.1080p-SOFCJ",
      "Shingeki no Kyojin Movie Kanketsu-hen",
    ],
    ["Boku.no.Hero.Academia.S8.WEB-DL.1080p", "Boku no Hero Academia S8"],
    ["[SubsPlus+] Oshi No Ko S2 [WEB-DL 1080p x264 DDP]", "Oshi No Ko S2"],
    ["Ксам'д - Позабывший невзгоды [BDRip 1080]", "Ксам'д - Позабывший невзгоды"],
    ["Haikyu!! 2nd Season [BDRip 1080p HEVC 10bit FLAC]", "Haikyu!! 2nd Season"],
    ["Gekijouban Kimetsu no Yaiba Mugen Ressha Hen [BDRemux]", "Kimetsu no Yaiba Mugen Ressha Hen"],
    ["frieren s2", "frieren s2"],
    ["spy x family", "spy x family"],
  ];
  it.each(cases)("strips %s to %s", (input, clean) => {
    expect(stripReleaseNoise(input)).toBe(clean);
  });
});
