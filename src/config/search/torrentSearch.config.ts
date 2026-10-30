import * as z from "zod/mini";

import { withFallback } from "@/lib/core/schema.utils";
import type { TorrentLifecycle } from "@/types/torrent/torrent";

const TORRENT_SORTS = ["name", "size", "progress", "speed", "custom"] as const;

const TORRENT_DIRS = ["asc", "desc"] as const;

const TORRENT_LIFECYCLES = [
  "all",
  "staging",
  "live",
  "paused",
  "seeding",
  "completed",
] as const satisfies readonly (TorrentLifecycle | "all")[];

export type TorrentSort = (typeof TORRENT_SORTS)[number];
export type TorrentDir = (typeof TORRENT_DIRS)[number];
export type TorrentLifecycleFilter = (typeof TORRENT_LIFECYCLES)[number];

export const torrentSearchSchema = z.object({
  q: withFallback(z.string(), ""),
  sort: withFallback(z.enum(TORRENT_SORTS), "name"),
  dir: withFallback(z.enum(TORRENT_DIRS), "asc"),
  page: withFallback(z.number(), 1),
  lifecycle: withFallback(z.enum(TORRENT_LIFECYCLES), "all"),
});

export type TorrentSearch = z.infer<typeof torrentSearchSchema>;
