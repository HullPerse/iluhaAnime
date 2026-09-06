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
