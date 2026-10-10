import { describe, expect, it } from "vitest";
import { resolveMediaFile } from "@/lib/media/resolve.utils";

describe("version episode feature", () => {
  it("parses single-token version 01v2", () => {
    expect(resolveMediaFile("Anime", "[BudLightSubs] One Piece 01v2 [1080p].mkv")).toMatchObject({
      title: "One Piece",
      episode: { number: 1, version: 2 },
      resolution: "1080p",
    });
  });

  it("parses parenthesized version 01 (v2)", () => {
    expect(resolveMediaFile("Anime", "[BudLightSubs] One Piece 01 (v2) [1080p].mkv")).toMatchObject({
      title: "One Piece",
      episode: { number: 1, version: 2 },
    });
  });

  it("parses split version 01 (v2) without space", () => {
    expect(resolveMediaFile("Anime", "[BudLightSubs] One Piece 01(v2) [1080p].mkv")).toMatchObject({
      title: "One Piece",
      episode: { number: 1, version: 2 },
    });
  });

  it("extracts epTitle after versioned episode number", () => {
    expect(resolveMediaFile("Anime", "[BudLightSubs] One Piece 01v2 Weatheria [1080p].mkv")).toMatchObject({
      title: "One Piece",
      episode: { number: 1, version: 2, title: "Weatheria" },
    });
  });

  it("keeps leading title numbers out of episode", () => {
    expect(resolveMediaFile("Movies", "12.Years.a.Slave.2013.1080p.mkv")).toMatchObject({
      title: "12 Years a Slave",
      year: 2013,
      kind: "movie",
    });
  });
});