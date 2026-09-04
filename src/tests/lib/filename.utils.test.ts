import { describe, expect, it } from "vitest";

import { parseVaultFilename } from "@/lib/filename.utils";

describe("filename utils", () => {
  it("parses common season and episode labels", () => {
    expect(parseVaultFilename("Frieren - S01E04 - 1080p HEVC.mkv")).toMatchObject({
      codec: "hevc",
      episode: 4,
      quality: "1080p",
      season: 1,
      title: "Frieren",
    });
  });

  it("parses alt episode and quality", () => {
    expect(parseVaultFilename("[SubsPlease] Bocchi the Rock! - 05 [1080p][AAC].mkv")).toMatchObject(
      {
        season: 1,
        episode: 5,
        quality: "1080p",
      }
    );
  });
});
