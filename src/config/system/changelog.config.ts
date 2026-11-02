import * as z from "zod/mini";

import type { ChangelogVersion } from "@/types/core/changelog";
import data from "./changelog.data.json";

const ChangelogScopeSchema = z.enum([
  "upscale",
  "player",
  "torrents",
  "collection",
  "anilist",
  "settings",
  "app",
  "search",
  "game",
  "streaming",
]);

const ChangelogEntrySchema = z.object({
  key: z.string(),
  scope: ChangelogScopeSchema,
});

const ChangelogVersionSchema = z.object({
  version: z.string(),
  added: z.array(ChangelogEntrySchema),
  changed: z.array(ChangelogEntrySchema),
  fixed: z.array(ChangelogEntrySchema),
});

const ChangelogDataSchema = z.object({
  changelog: z.array(ChangelogVersionSchema),
});

const parsed = ChangelogDataSchema.parse(data);

export const CHANGELOG = parsed.changelog as ChangelogVersion[];