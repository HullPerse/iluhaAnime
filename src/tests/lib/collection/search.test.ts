import { describe, expect, it } from "vitest";

import { buildCollectionSearchIndex, searchCollectionIndex } from "@/lib/collection/search.utils";
import type { CollectionItem } from "@/types/collection";

const item = (id: string, title: string, extra: Partial<CollectionItem> = {}) =>
  ({ id, title, altTitles: [], genres: [], studio: null, ...extra }) as CollectionItem;

describe("collection search index", () => {
  it("finds titles, aliases, genres, and studios", () => {
    const items = [
      item("a", "Frieren", { altTitles: ["Sousou no Frieren"] }),
      item("b", "Bleach", { genres: ["Action"] }),
      item("c", "Naruto", { studio: "Pierrot" }),
    ];
    const index = buildCollectionSearchIndex(items);
    expect(searchCollectionIndex(index, "sousou").map((x) => x.id)).toEqual(["a"]);
    expect(searchCollectionIndex(index, "act").map((x) => x.id)).toEqual(["b"]);
    expect(searchCollectionIndex(index, "pier").map((x) => x.id)).toEqual(["c"]);
  });
});

describe("collection people search", () => {
  const withPeople = item("d", "Horimiya", {
    detailsJson: {
      staff: [{ id: 1, name: "Masashi Ishihama", role: "Director" }],
      characters: [
        {
          id: 2,
          name: "Kyouko Hori",
          voiceActors: [{ id: 3, name: "Haruka Tomatsu" }],
        },
      ],
    },
  });

  it("finds staff, characters, and voice actors by name", () => {
    const index = buildCollectionSearchIndex([withPeople]);
    expect(searchCollectionIndex(index, "ishihama").map((x) => x.id)).toEqual(["d"]);
    expect(searchCollectionIndex(index, "kyouko").map((x) => x.id)).toEqual(["d"]);
    expect(searchCollectionIndex(index, "tomatsu").map((x) => x.id)).toEqual(["d"]);
  });

  it("ignores items without stored people", () => {
    const index = buildCollectionSearchIndex([item("e", "Naruto")]);
    expect(searchCollectionIndex(index, "ishihama")).toEqual([]);
  });
});
