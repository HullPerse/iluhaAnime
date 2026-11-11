import * as z from "zod/mini";

const HttpUrlSchema = z.string().check(
  z.refine((value) => value.startsWith("https://") || value.startsWith("http://"), {
    message: "url must be http or https",
  })
);

const NewsRunSchema = z.looseObject({
  text: z.string(),
  bold: z.optional(z.boolean()),
  italic: z.optional(z.boolean()),
  href: z.optional(HttpUrlSchema),
});

const NewsBlockSchema = z.looseObject({
  kind: z.union([z.literal("paragraph"), z.literal("quote")]),
  runs: z.array(NewsRunSchema),
});

const NewsAttachmentSchema = z.looseObject({
  kind: z.union([z.literal("image"), z.literal("youtube"), z.literal("vk")]),
  previewUrl: HttpUrlSchema,
  fullUrl: z.optional(HttpUrlSchema),
  embedUrl: z.optional(HttpUrlSchema),
  pageUrl: z.optional(HttpUrlSchema),
});

const NewsItemSchema = z.looseObject({
  id: z.number(),
  title: z.string(),
  createdAt: z.string(),
  siteUrl: HttpUrlSchema,
  blocks: z.array(NewsBlockSchema),
  attachments: z.array(NewsAttachmentSchema),
  linkedAnimeId: z.optional(z.number()),
});

const NewsAnimeLinkSchema = z.looseObject({
  anilistId: z.number(),
  malId: z.number(),
});

export const NewsPageSchema = z.compile(
  z.looseObject({
    items: z.array(NewsItemSchema),
    page: z.number(),
    hasMore: z.boolean(),
  })
);

export const NewsAnimeLinkSchemaCompiled = z.compile(NewsAnimeLinkSchema);
