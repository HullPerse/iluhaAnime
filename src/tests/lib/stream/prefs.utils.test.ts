import { describe, expect, it } from "vitest";

import {
  emptyPrefs,
  isNativeVariant,
  pickVariant,
  preferNativeVariants,
  withQuality,
  withTrack,
  withVariant,
} from "@/lib/stream/prefs.utils";
import type { StreamPrefs, StreamVariant } from "@/types/stream";

function variant(player: string, id: string, name: string): StreamVariant {
  return {
    id,
    name,
    language: "Озвучка",
    separateStream: true,
    player,
    sourceUrl: "",
  };
}

function prefs(patch: Partial<StreamPrefs> = {}): StreamPrefs {
  return { ...emptyPrefs("animelib", "11"), ...patch };
}

const rows = [
  variant("Kodik", "32416", "AniDUB"),
  variant("Kodik", "32412", "RISE I voices"),
  variant("Anilib", "7", "Субтитры"),
];

const nativeRows = [
  variant("Kodik", "32416", "AniDUB"),
  variant("Animelib", "32416", "AniDUB"),
  variant("Kodik", "32412", "RISE I voices"),
  variant("Animelib", "32412", "RISE I voices"),
  variant("Kodik", "999", "Only Kodik"),
];

describe("stream preferences", () => {
  it("starts with subtitles on and nothing remembered", () => {
    expect(prefs()).toEqual({
      sourceId: "animelib",
      mediaId: "11",
      variantId: "",
      quality: "",
      audioLang: "",
      subLang: "",
      subEnabled: true,
    });
  });

  it("plays the remembered voice-over, not the first row", () => {
    const chosen = pickVariant(rows, prefs({ variantId: "Kodik:32412" }));
    expect(chosen?.name).toBe("RISE I voices");
  });

  it("falls back to another row of the remembered player", () => {
    const chosen = pickVariant(rows, prefs({ variantId: "Kodik:99999" }));
    expect(chosen?.name).toBe("AniDUB");
  });

  it("falls back to the first row when nothing is remembered", () => {
    expect(pickVariant(rows, null)?.id).toBe("32416");
    expect(pickVariant(rows, prefs({ variantId: "Anilib:1" }))?.player).toBe("Anilib");
  });

  it("returns null only when the episode has no rows", () => {
    expect(pickVariant([], prefs({ variantId: "Kodik:32416" }))).toBeNull();
  });

  it("replaces a Kodik mirror with the site's own row for the same team", () => {
    expect(nativeRows.filter(isNativeVariant)).toHaveLength(2);
    expect(preferNativeVariants(nativeRows).map((row) => `${row.player}:${row.id}`)).toEqual([
      "Animelib:32416",
      "Animelib:32412",
      "Kodik:999",
    ]);
  });

  it("plays the native row by default and keeps Teams without one", () => {
    const chosen = pickVariant(nativeRows, null);
    expect(chosen?.player).toBe("Animelib");
    expect(chosen?.id).toBe("32416");
    expect(preferNativeVariants(nativeRows).at(-1)?.id).toBe("999");
  });

  it("maps a remembered Kodik voice-over to the native row of the same team", () => {
    const chosen = pickVariant(nativeRows, prefs({ variantId: "Kodik:32412" }));
    expect(chosen?.player).toBe("Animelib");
    expect(chosen?.id).toBe("32412");
  });

  it("remembers the chosen voice-over and quality", () => {
    const remembered = withQuality(withVariant(prefs(), rows[1]), "720p");
    expect(remembered.variantId).toBe("Kodik:32412");
    expect(remembered.quality).toBe("720p");
  });

  it("remembers the audio language without touching the subtitle choice", () => {
    const remembered = withTrack(prefs({ subLang: "ru" }), "audio", "AniDUB");
    expect(remembered.audioLang).toBe("AniDUB");
    expect(remembered.subLang).toBe("ru");
  });

  it("turns subtitles off from the track choice", () => {
    const off = withTrack(prefs({ subLang: "ru" }), "sub", "no");
    expect(off.subLang).toBe("no");
    expect(off.subEnabled).toBe(false);
    expect(withTrack(off, "sub", "ru").subEnabled).toBe(true);
  });
});
