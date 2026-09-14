import { describe, expect, it } from "vitest";

import { buildCollectionShareLink, parseCollectionShareLink } from "@/lib/utils/deeplink.utils";
import type { CollectionItem } from "@/types/collection";

function makeItem(overrides: Partial<CollectionItem> = {}): CollectionItem {
  return {
    id: "id-1",
    title: "Frieren",
    altTitles: [],
    type: "anime",
    status: "planning",
    progressValue: 0,
    progressTotal: 28,
    progressUnit: "episodes",
    durationMinutes: 24,
    rating: null,
    priority: "normal",
    isFavorite: false,
    year: 2023,
    releaseDate: null,
    genres: [],
    studio: null,
    description: null,
    notes: "private note",
    coverUrl: "https://s4.anilist.co/file/frieren.jpg",
    coverBlobId: null,
    thumbBlobId: null,
    externalIds: { anilist: 154587 },
    customFields: {},
    localPath: null,
    localKind: null,
    startedAt: null,
    finishedAt: null,
    lastWatchedAt: null,
    rewatchCount: 0,
    addedAt: 0,
    updatedAt: 0,
    sitesToView: [],
    tvCurrentSeason: null,
    tvCurrentEpisode: null,
    detailsJson: null,
    ...overrides,
  };
}

async function gzipToBase64Url(text: string): Promise<string> {
  const compressed = new CompressionStream("gzip");
  const writer = compressed.writable.getWriter();
  const bufferPromise = new Response(compressed.readable).arrayBuffer();
  await writer.write(new TextEncoder().encode(text));
  await writer.close();
  const buffer = await bufferPromise;
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCodePoint(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function linkFromPayload(payload: unknown): Promise<string> {
  return `iluhaanime://collection/share/${await gzipToBase64Url(JSON.stringify(payload))}`;
}

const slimItem = {
  title: "Frieren",
  type: "anime",
  year: 2023,
  status: "planning",
  externalIds: { anilist: 154587 },
  coverUrl: "https://s4.anilist.co/file/frieren.jpg",
};

describe("buildCollectionShareLink", () => {
  it("builds a link with the collection/share prefix and a base64url payload", async () => {
    const link = await buildCollectionShareLink([makeItem()]);
    expect(link.startsWith("iluhaanime://collection/share/")).toBe(true);
    expect(link.slice("iluhaanime://collection/share/".length)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("throws on an empty selection", async () => {
    await expect(buildCollectionShareLink([])).rejects.toThrow(/empty/i);
  });

  it("throws above the parser item cap", async () => {
    const items = Array.from({ length: 501 }, (_, index) =>
      makeItem({ id: `id-${index}`, title: `Title ${index}` })
    );
    await expect(buildCollectionShareLink(items)).rejects.toThrow(/500/);
  });

  it("embeds only the allowlisted slim fields", async () => {
    const link = await buildCollectionShareLink([
      makeItem({
        notes: "secret",
        rating: 9,
        localPath: "D:/anime/frieren",
        description: "long synopsis",
      }),
    ]);
    const parsed = await parseCollectionShareLink(link);
    expect(Object.keys(parsed?.items[0] ?? {}).sort()).toEqual(
      ["coverUrl", "externalIds", "status", "title", "type", "year"].sort()
    );
    expect(parsed?.items[0]).not.toHaveProperty("notes");
    expect(parsed?.items[0]).not.toHaveProperty("localPath");
  });

  it("drops cover urls that are not http(s)", async () => {
    const link = await buildCollectionShareLink([
      makeItem({ coverUrl: "data:image/png;base64,AAAA" }),
    ]);
    const parsed = await parseCollectionShareLink(link);
    expect(parsed?.items[0]?.coverUrl).toBeNull();
  });
});

describe("collection share round-trip", () => {
  it("round-trips a snapshot", async () => {
    const link = await buildCollectionShareLink([makeItem()], "Идеи для вечера");
    expect(await parseCollectionShareLink(link)).toEqual({
      version: 1,
      label: "Идеи для вечера",
      items: [slimItem],
    });
  });

  it("preserves order and count", async () => {
    const link = await buildCollectionShareLink([
      makeItem({ id: "a", title: "First" }),
      makeItem({ id: "b", title: "Second" }),
      makeItem({ id: "c", title: "Third" }),
    ]);
    const parsed = await parseCollectionShareLink(link);
    expect(parsed?.items.map((item) => item.title)).toEqual(["First", "Second", "Third"]);
  });

  it("keeps a missing label as null", async () => {
    const link = await buildCollectionShareLink([makeItem()]);
    const parsed = await parseCollectionShareLink(link);
    expect(parsed?.label).toBeNull();
  });

  it("trims surrounding whitespace and accepts an uppercase scheme", async () => {
    const link = await buildCollectionShareLink([makeItem()]);
    const uppercase = `  ${link.replace("iluhaanime", "ILUHAANIME")}  `;
    const parsed = await parseCollectionShareLink(uppercase);
    expect(parsed?.items).toHaveLength(1);
  });

  it("normalizes external ids on the way out", async () => {
    const link = await buildCollectionShareLink([
      makeItem({ externalIds: { anilist: 154587, mal: 52991, tmdb: 209867, imdb: "tt22248376" } }),
    ]);
    const parsed = await parseCollectionShareLink(link);
    expect(parsed?.items[0]?.externalIds).toEqual({
      anilist: 154587,
      mal: 52991,
      tmdb: 209867,
      imdb: "tt22248376",
    });
  });
});

describe("parseCollectionShareLink rejections", () => {
  it("rejects empty, blank, and foreign links", async () => {
    expect(await parseCollectionShareLink("")).toBeNull();
    expect(await parseCollectionShareLink("   ")).toBeNull();
    expect(await parseCollectionShareLink("https://example.com")).toBeNull();
    expect(await parseCollectionShareLink("iluhaanime://anime/anilist/21")).toBeNull();
    expect(await parseCollectionShareLink("iluhaanime://collection/other/abc")).toBeNull();
    expect(await parseCollectionShareLink("iluhaanime://collection/share/")).toBeNull();
    expect(await parseCollectionShareLink("xiluhaanime://collection/share/abc")).toBeNull();
  });

  it("rejects a segment with non base64url characters", async () => {
    expect(await parseCollectionShareLink("iluhaanime://collection/share/abc?x=1")).toBeNull();
    expect(await parseCollectionShareLink("iluhaanime://collection/share/abc#frag")).toBeNull();
    expect(await parseCollectionShareLink("iluhaanime://collection/share/a+b/c")).toBeNull();
  });

  it("rejects an oversized segment before decoding it", async () => {
    const huge = "A".repeat(262_145);
    expect(await parseCollectionShareLink(`iluhaanime://collection/share/${huge}`)).toBeNull();
  });

  it("rejects payloads that are not gzip, not JSON, or not the right shape", async () => {
    const notGzip = btoa("hello world").replace(/=+$/, "");
    expect(await parseCollectionShareLink(`iluhaanime://collection/share/${notGzip}`)).toBeNull();

    const notJson = `iluhaanime://collection/share/${await gzipToBase64Url("not json")}`;
    expect(await parseCollectionShareLink(notJson)).toBeNull();

    const arrayPayload = `iluhaanime://collection/share/${await gzipToBase64Url("[1,2,3]")}`;
    expect(await parseCollectionShareLink(arrayPayload)).toBeNull();

    expect(
      await parseCollectionShareLink(await linkFromPayload({ version: 2, items: [] }))
    ).toBeNull();
    expect(await parseCollectionShareLink(await linkFromPayload({ version: 1 }))).toBeNull();
    expect(
      await parseCollectionShareLink(await linkFromPayload({ version: 1, items: "x" }))
    ).toBeNull();
  });

  it("rejects empty and oversized item lists", async () => {
    expect(
      await parseCollectionShareLink(await linkFromPayload({ version: 1, items: [] }))
    ).toBeNull();
    const items = Array.from({ length: 501 }, () => slimItem);
    expect(await parseCollectionShareLink(await linkFromPayload({ version: 1, items }))).toBeNull();
  });

  it("rejects items missing a required field", async () => {
    const missingTitle = { ...slimItem, title: "" };
    expect(
      await parseCollectionShareLink(await linkFromPayload({ version: 1, items: [missingTitle] }))
    ).toBeNull();

    const badType = { ...slimItem, type: "manga" };
    expect(
      await parseCollectionShareLink(await linkFromPayload({ version: 1, items: [badType] }))
    ).toBeNull();

    const emptyStatus = { ...slimItem, status: "  " };
    expect(
      await parseCollectionShareLink(await linkFromPayload({ version: 1, items: [emptyStatus] }))
    ).toBeNull();

    expect(
      await parseCollectionShareLink(
        await linkFromPayload({ version: 1, items: ["not an object"] })
      )
    ).toBeNull();
  });

  it("rejects when any single item is invalid", async () => {
    const link = await linkFromPayload({
      version: 1,
      items: [slimItem, { ...slimItem, type: "nope" }],
    });
    expect(await parseCollectionShareLink(link)).toBeNull();
  });
});

describe("collection share field normalization", () => {
  it("trims and clamps values, and drops invalid ids, year, cover, and imdb", async () => {
    const link = await linkFromPayload({
      version: 1,
      label: "  ",
      items: [
        {
          title: "  Padded Title  ",
          type: "movie",
          year: 12,
          status: "  watching  ",
          externalIds: { anilist: -1, mal: 5, tmdb: "5", imdb: "nope" },
          coverUrl: ["javascript", "alert(1)"].join(":"),
        },
      ],
    });
    expect(await parseCollectionShareLink(link)).toEqual({
      version: 1,
      label: null,
      items: [
        {
          title: "Padded Title",
          type: "movie",
          year: null,
          status: "watching",
          externalIds: { mal: 5 },
          coverUrl: null,
        },
      ],
    });
  });

  it("ignores unknown fields on an item", async () => {
    const link = await linkFromPayload({
      version: 1,
      items: [{ ...slimItem, notes: "leak", localPath: "D:/x" }],
    });
    const parsed = await parseCollectionShareLink(link);
    expect(parsed?.items[0]).toEqual(slimItem);
  });
});
