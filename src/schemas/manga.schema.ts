import * as z from "zod/mini";

export const searchHitSchema = z.object({
  id: z.string(),
  title: z.string(),
  cover: z.nullable(z.string()),
  status: z.optional(z.nullable(z.string())),
  chapters: z.optional(z.nullable(z.number())),
  suggestive: z.boolean(),
  rating: z.string(),
  aliases: z.array(z.string()),
  externalIds: z.object({ anilist: z.nullable(z.number()), mal: z.nullable(z.number()) }),
  webUrl: z.optional(z.nullable(z.string())),
});

export const searchPageSchema = z.compile(
  z.object({
    items: z.array(searchHitSchema),
    hasNext: z.boolean(),
  })
);

export const searchMetaSchema = z.compile(
  z.array(z.object({ id: z.string(), chapters: z.number() }))
);

export const chapterSchema = z.object({
  id: z.string(),
  number: z.string(),
  volume: z.nullable(z.string()),
  key: z.string(),
  title: z.nullable(z.string()),
  language: z.enum(["ru", "en"]),
  group: z.nullable(z.string()),
  locked: z.boolean(),
  lockReason: z.nullable(z.enum(["paid", "closed", "external"])),
  availableAt: z.nullable(z.string()),
  branch: z.nullable(z.number()),
});

const detailsShape = z.object({
  title: searchHitSchema,
  description: z.nullable(z.string()),
  authors: z.array(z.string()),
  artists: z.array(z.string()),
  authorKeys: z.optional(z.array(z.string())),
  artistKeys: z.optional(z.array(z.string())),
  genres: z.array(z.string()),
  release: z.nullable(z.string()),
  chapters: z.array(chapterSchema),
  notification: z.optional(
    z.object({
      newChapters: z.number(),
      statusChange: z.nullable(z.tuple([z.string(), z.string()])),
    })
  ),
});

export const detailsSchema = z.compile(detailsShape);

export const cachedDetailsSchema = z.compile(z.nullable(detailsShape));

export const manifestSchema = z.object({ key: z.string(), count: z.number() });

export const pageCacheStatsSchema = z.compile(z.object({ bytes: z.number(), count: z.number() }));

const sourceSchema = z.enum(["mangalib", "mangadex", "readmanga", "asurascans", "wamanga"]);

export const sourceSettingsSchema = z.array(z.object({ id: sourceSchema, enabled: z.boolean() }));

export const itemSchema = z.object({
  id: z.string(),
  source: sourceSchema,
  mangaId: z.string(),
  title: z.string(),
  cover: z.nullable(z.string()),
  rating: z.string(),
  status: z.string(),
  unread: z.number(),
  read: z.number(),
  updatedAt: z.number(),
  lastReadAt: z.nullable(z.number()),
  favourite: z.optional(z.boolean()),
});

export const statusSchema = z.object({ id: z.string(), label: z.string(), color: z.string() });

export const librarySchema = z.object({
  items: z.array(itemSchema),
  statuses: z.array(statusSchema),
});

export const historySchema = z.array(
  z.object({
    itemId: z.string(),
    source: sourceSchema,
    mangaId: z.string(),
    title: z.string(),
    cover: z.optional(z.nullable(z.string())),
    rating: z.optional(z.string()),
    chapterKey: z.string(),
    chapterId: z.string(),
    openedAt: z.number(),
  })
);

export const saveSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("saved") }),
  z.object({ kind: z.literal("duplicate"), item: itemSchema }),
]);

export const readerStateSchema = z.object({
  id: z.string(),
  page: z.number(),
  scrollOffset: z.number(),
  readKeys: z.array(z.string()),
});

export const mangaReadKeysSchema = z.array(z.string());
