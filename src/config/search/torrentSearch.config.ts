import * as z from "zod/mini";

import { withFallback } from "@/lib/core/persistence/schema.utils";
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
] satisfies readonly (TorrentLifecycle | "all")[];

export type { TorrentSort, TorrentLifecycleFilter } from "@/types/search/torrentSearch";

export const torrentSearchSchema = z.object({
  q: withFallback(z.string(), ""),
  sort: withFallback(z.enum(TORRENT_SORTS), "name"),
  dir: withFallback(z.enum(TORRENT_DIRS), "asc"),
  page: withFallback(z.number(), 1),
  lifecycle: withFallback(z.enum(TORRENT_LIFECYCLES), "all"),
});
