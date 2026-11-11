import * as z from "zod/mini";

const CollectionExternalIdsSchema = z.looseObject({
  anilist: z.optional(z.number()),
  mal: z.optional(z.number()),
  tmdb: z.optional(z.number()),
  imdb: z.optional(z.string()),
});

export const CollectionDetailsSchema = z.looseObject({
  seasons: z.optional(
    z.array(
      z.looseObject({
        seasonNumber: z.number(),
        episodeCount: z.number(),
        name: z.string(),
      })
    )
  ),
  stills: z.optional(z.array(z.string())),
  trailerYoutubeId: z.optional(z.nullable(z.string())),
  staff: z.optional(
    z.array(
      z.looseObject({
        id: z.number(),
        name: z.string(),
        role: z.string(),
      })
    )
  ),
  characters: z.optional(
    z.array(
      z.looseObject({
        id: z.number(),
        name: z.string(),
        voiceActors: z.array(z.looseObject({ id: z.number(), name: z.string() })),
      })
    )
  ),
});

export const CollectionSitesSchema = z.array(z.looseObject({ url: z.string() }));

const CollectionRowSchema = z.looseObject({
  id: z.string(),
  title: z.string(),
  altTitles: z.array(z.string()),
  type: z.string(),
  status: z.string(),
  progressValue: z.number(),
  progressTotal: z.nullable(z.number()),
  progressUnit: z.string(),
  durationMinutes: z.nullable(z.number()),
  rating: z.nullable(z.number()),
  priority: z.string(),
  isFavorite: z.union([z.boolean(), z.number()]),
  year: z.nullable(z.number()),
  releaseDate: z.nullable(z.string()),
  genres: z.array(z.string()),
  studio: z.nullable(z.string()),
  description: z.nullable(z.string()),
  notes: z.nullable(z.string()),
  coverUrl: z.nullable(z.string()),
  coverBlobId: z.nullable(z.string()),
  thumbBlobId: z.nullable(z.string()),
  externalIds: CollectionExternalIdsSchema,
  customFields: z.looseObject({}),
  localPath: z.nullable(z.string()),
  localKind: z.nullable(z.enum(["file", "folder"])),
  startedAt: z.nullable(z.number()),
  finishedAt: z.nullable(z.number()),
  lastWatchedAt: z.nullable(z.number()),
  rewatchCount: z.number(),
  addedAt: z.number(),
  updatedAt: z.number(),
  sitesToView: z.optional(z.unknown()),
  tvCurrentSeason: z.optional(z.nullable(z.number())),
  tvCurrentEpisode: z.optional(z.nullable(z.number())),
  detailsJson: z.optional(z.unknown()),
});

export const CollectionRowListSchema = z.compile(z.array(CollectionRowSchema));
