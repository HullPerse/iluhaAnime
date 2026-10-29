import { describe, expect, it } from "vitest";

import { anilistEpisodePreviews, episodeNumberFromTitle } from "@/lib/stream/episodes.utils";

function row(title: string, thumbnail?: string) {
  return { title, thumbnail, url: "", site: "Crunchyroll" };
}

describe("stream/episodes", () => {
  it("reads the episode number from the shapes AniList uses", () => {
    expect(episodeNumberFromTitle("Episode 12 - The Journey")).toBe(12);
    expect(episodeNumberFromTitle("Ep. 3")).toBe(3);
    expect(episodeNumberFromTitle("7 - Magic")).toBe(7);
    expect(episodeNumberFromTitle("Серия 4")).toBe(4);
    expect(episodeNumberFromTitle("4")).toBe(4);
  });

  it("ignores titles without a number", () => {
    expect(episodeNumberFromTitle("OVA")).toBeNull();
    expect(episodeNumberFromTitle("Special")).toBeNull();
    expect(episodeNumberFromTitle("")).toBeNull();
  });

  it("maps previews by number and keeps the first duplicate", () => {
    const previews = anilistEpisodePreviews([
      row("Episode 1 - Start", "https://s4.anilist.co/1.jpg"),
      row("Episode 1 - Start", "https://s4.anilist.co/1-duplicate.jpg"),
      row("Episode 2 - Next", "https://s4.anilist.co/2.jpg"),
    ]);

    expect(previews.get(1)).toBe("https://s4.anilist.co/1.jpg");
    expect(previews.get(2)).toBe("https://s4.anilist.co/2.jpg");
    expect(previews.size).toBe(2);
  });

  it("skips rows without a thumbnail or a number", () => {
    const previews = anilistEpisodePreviews([
      row("Episode 3 - Missing art"),
      row("OVA", "https://s4.anilist.co/ova.jpg"),
    ]);

    expect(previews.size).toBe(0);
  });
});
