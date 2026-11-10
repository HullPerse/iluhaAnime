import * as z from "zod/mini";

import type { AniListFilters } from "@/types/anilist/anilist";
import data from "./anilistFilters.data.json";

const AniListFiltersSchema = z.object({
  adult: z.boolean(),
  country: z.string(),
  episodes: z.tuple([z.number(), z.number()]),
  format: z.string(),
  genres: z.array(z.string()),
  score: z.tuple([z.number(), z.number()]),
  season: z.string(),
  seasonYear: z.nullable(z.number()),
  sort: z.string(),
  source: z.string(),
  status: z.string(),
  tags: z.array(z.string()),
  year: z.tuple([z.number(), z.number()]),
});

const AnilistFiltersDataSchema = z.object({
  ANILIST_GENRES: z.array(z.string()),
  ANILIST_NSFW_TAGS: z.array(z.string()),
  ANILIST_TAGS: z.array(z.string()),
  BROWSE_GENRE_COUNT: z.number(),
  defaultFilters: AniListFiltersSchema,
  DETAIL_TAG_COUNT: z.number(),
  FORMATS: z.array(z.string()),
  NSFW_TAG_SET: z.array(z.string()),
  SEASONS: z.array(z.string()),
  STATUSES: z.array(z.string()),
});

const parsed = AnilistFiltersDataSchema.parse(data);

export const ANILIST_GENRES = parsed.ANILIST_GENRES;
export const ANILIST_NSFW_TAGS = parsed.ANILIST_NSFW_TAGS;
export const ANILIST_TAGS = parsed.ANILIST_TAGS;
export const BROWSE_GENRE_COUNT = parsed.BROWSE_GENRE_COUNT;
export const defaultFilters = parsed.defaultFilters as AniListFilters;
export const DETAIL_TAG_COUNT = parsed.DETAIL_TAG_COUNT;
export const FORMATS = parsed.FORMATS;
export const NSFW_TAG_SET = new Set(parsed.NSFW_TAG_SET);
export const SEASONS = parsed.SEASONS;
export const STATUSES = parsed.STATUSES;
