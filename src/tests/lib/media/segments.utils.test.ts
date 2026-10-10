import { describe, expect, it } from "vitest";

import { KNOWN_ARCS } from "@/config/media/tokens.config";
import { normForCompare, resolveSegments, splitKnownArcTail } from "@/lib/media/segments.utils";

describe("splitKnownArcTail contract", () => {
  it("splits a known arc off the word tail", () => {
    expect(
      splitKnownArcTail(["Kimetsu", "no", "Yaiba", "Hashira", "Geiko", "hen"], KNOWN_ARCS)
    ).toEqual({ head: ["Kimetsu", "no", "Yaiba"], arc: "Hashira Geiko-hen" });
  });

  it("returns null when the tail is not an arc", () => {
    expect(splitKnownArcTail(["Naruto"], KNOWN_ARCS)).toBeNull();
  });

  it("returns null for a plain title with several words", () => {
    expect(splitKnownArcTail(["Boku", "no", "Hero"], KNOWN_ARCS)).toBeNull();
  });
});

describe("resolveSegments arc contract", () => {
  it("splits a known arc off two segments", () => {
    expect(
      resolveSegments(
        "Overlord - Sei Oukoku Hen [BDRip 1080p HEVC 10bits FLAC]",
        "",
        "Overlord Sei Oukoku Hen"
      )
    ).toEqual({ title: "Overlord", arc: "Sei Oukoku-hen", movieHint: true });
  });

  it("keeps an unknown hyphen-hen arc instead of gluing it into the title", () => {
    expect(resolveSegments("Some Show - Foo Bar-hen", "", "fallback")).toEqual({
      title: "Some Show",
      arc: "Foo Bar-hen",
      movieHint: true,
    });
  });

  it("finds the arc in the middle of three segments", () => {
    expect(
      resolveSegments(
        "[Moozzi2] Kimetsu no Yaiba - Hashira Geiko-hen - 01 [BDRip]",
        "",
        "fallback"
      )
    ).toEqual({ title: "Kimetsu no Yaiba", arc: "Hashira Geiko-hen", movieHint: true });
  });

  it("joins two non-arc segments with a colon", () => {
    expect(resolveSegments("Garouden - The Way of the Lone Wolf", "", "fallback")).toEqual({
      title: "Garouden: The Way of the Lone Wolf",
      movieHint: true,
    });
  });

  it("resolves a prefix from three segments against the folder", () => {
    expect(
      resolveSegments(
        "Vigilante - Boku no Hero Academia Illegals - 01 [1080p]",
        "Anime/Boku.no.Hero.Academia.Illegals.WEB-DL.1080p",
        "fallback"
      )
    ).toEqual({
      title: "Boku no Hero Academia Illegals",
      prefix: "Vigilante",
      movieHint: true,
    });
  });

  it("joins three segments with a colon when both match the folder", () => {
    expect(resolveSegments("A - B - 01", "x/A x/B", "fallback")).toEqual({
      title: "A: B",
      movieHint: true,
    });
  });

  it("falls back when no segment matches the folder", () => {
    expect(resolveSegments("A - B - 01", "zzz", "FB")).toEqual({ title: "FB" });
  });

  it("does not join when the last segment is an episode marker", () => {
    expect(resolveSegments("Show Name - 01 [BDRip 1080p]", "", "Show Name")).toEqual({
      title: "Show Name",
    });
  });

  it("strips stacked tech brackets off joined segments", () => {
    expect(
      resolveSegments("Youjo Senki - Sabaku no Pasta Dai Sakusen [1080p][Multiple Subtitle]", "", "fallback")
    ).toEqual({ title: "Youjo Senki: Sabaku no Pasta Dai Sakusen", movieHint: true });
  });

  it("returns the fallback for a single segment", () => {
    expect(resolveSegments("Naruto", "", "Naruto")).toEqual({ title: "Naruto" });
  });

  it("normalizes dots and underscores for comparison", () => {
    expect(normForCompare("Boku.no_Hero")).toBe("boku no hero");
  });
});
