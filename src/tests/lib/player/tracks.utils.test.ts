import { describe, expect, it } from "vitest";

import {
  sortTracksByLanguage,
  toTrackDisplay,
  trackLabel,
  trackLanguageName,
  trackMainLabel,
} from "@/lib/player/tracks.utils";
import type { MpvTrack } from "@/types/videoPlayer";

function track(overrides: Partial<MpvTrack> & { id: number; type: MpvTrack["type"] }): MpvTrack {
  return { ...overrides };
}

describe("player/tracks labels", () => {
  it("shows title and language code together like MPC", () => {
    const main = trackMainLabel(
      track({ id: 3, type: "sub", title: "Надписи [Amber Studio]", lang: "rus", codec: "ass" })
    );
    expect(main).toBe("Надписи [Amber Studio] [rus] - ASS");
    expect(trackLanguageName(track({ id: 3, type: "sub", lang: "rus" }))).toBe("Russian");
  });

  it("keeps language-only tracks compact without brackets", () => {
    expect(
      trackMainLabel(
        track({ id: 2, type: "audio", lang: "ja", codec: "eac3", "demux-channels": "5.1(side)" })
      )
    ).toBe("ja - EAC3 - 5.1(side)");
  });

  it("does not duplicate the code already present in the title", () => {
    expect(
      trackMainLabel(
        track({ id: 5, type: "sub", title: "Full [GER]", lang: "ger", codec: "subrip" })
      )
    ).toBe("Full [GER] - SUBRIP");
  });

  it("appends default and forced flags like MPC", () => {
    expect(
      trackMainLabel(
        track({
          id: 3,
          type: "sub",
          title: "Надписи [Amber Studio]",
          lang: "rus",
          codec: "ass",
          default: true,
        })
      )
    ).toBe("Надписи [Amber Studio] [rus] - ASS [default]");
    expect(
      trackMainLabel(
        track({ id: 6, type: "sub", title: "Forced", lang: "eng", codec: "subrip", forced: true })
      )
    ).toBe("Forced [eng] - SUBRIP [forced]");
  });

  it("drops unknown channel layouts instead of showing garbage", () => {
    expect(
      trackMainLabel(track({ id: 1, type: "audio", title: "Дубляжная", lang: "rus", codec: "aac" }))
    ).toBe("Дубляжная [rus] - AAC");
    expect(
      trackMainLabel(
        track({
          id: 2,
          type: "audio",
          lang: "de",
          codec: "eac3",
          "demux-channels": "unknown",
        })
      )
    ).toBe("de - EAC3");
  });

  it("falls back to the track id when nothing else exists", () => {
    expect(trackMainLabel(track({ id: 9, type: "sub" }))).toBe("#9");
  });

  it("combines main label and language for single-line surfaces", () => {
    expect(
      trackLabel(
        track({ id: 3, type: "sub", title: "Надписи [Amber Studio]", lang: "rus", codec: "ass" })
      )
    ).toBe("Надписи [Amber Studio] [rus] - ASS - Russian");
    expect(trackLabel(track({ id: 9, type: "sub" }))).toBe("#9");
  });

  it("exposes the two-column display parts", () => {
    expect(
      toTrackDisplay(
        track({ id: 3, type: "sub", title: "Надписи [Amber Studio]", lang: "rus", codec: "ass" })
      )
    ).toEqual({
      id: 3,
      main: "Надписи [Amber Studio] [rus] - ASS",
      language: "Russian",
    });
  });
});

describe("player/tracks sorting", () => {
  it("sorts by language name with languageless tracks last", () => {
    const sorted = sortTracksByLanguage([
      track({ id: 1, type: "sub", title: "LostLife Studio", lang: "rus", codec: "ass" }),
      track({ id: 2, type: "sub", title: "Full", lang: "jpn", codec: "subrip" }),
      track({ id: 3, type: "sub", title: "Full", lang: "eng", codec: "subrip" }),
      track({ id: 4, type: "sub", title: "Mystery", codec: "subrip" }),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual([3, 2, 1, 4]);
  });

  it("keeps the file order for the same language", () => {
    const sorted = sortTracksByLanguage([
      track({ id: 1, type: "sub", title: "Full", lang: "ger", codec: "subrip" }),
      track({ id: 2, type: "sub", title: "Forced", lang: "ger", codec: "subrip" }),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual([1, 2]);
  });
});
