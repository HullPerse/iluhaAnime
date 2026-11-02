import { describe, expect, test } from "vitest";

import { lowerQualityLabel } from "@/lib/player/streamQuality.utils";
import type { StreamVariantSource } from "@/types/player/videoPlayer";

function source(label: string): StreamVariantSource {
  return { url: `https://cdn/${label}.m3u8`, type: "m3u8", quality: label, label };
}

describe("lowerQualityLabel", () => {
  const sources = [source("1080p"), source("720p"), source("480p"), source("360p")];

  test("picks the next quality down", () => {
    expect(lowerQualityLabel(sources, "1080p")).toBe("720p");
    expect(lowerQualityLabel(sources, "720p")).toBe("480p");
  });

  test("never goes up when the source list is not sorted", () => {
    const shuffled = [source("480p"), source("1080p"), source("360p"), source("720p")];
    expect(lowerQualityLabel(shuffled, "720p")).toBe("480p");
    expect(lowerQualityLabel(shuffled, "1080p")).toBe("720p");
  });

  test("returns nothing at the lowest quality or for an unknown label", () => {
    expect(lowerQualityLabel(sources, "360p")).toBeNull();
    expect(lowerQualityLabel(sources, "1440p")).toBeNull();
    expect(lowerQualityLabel([], "720p")).toBeNull();
  });
});
