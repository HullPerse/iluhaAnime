import type { TagToleranceKey } from "@/types/search";

export const TAG_NUMERIC_KEYS: TagToleranceKey[] = ["year", "rating", "episodes", "progress"];
export const TAG_NUMERIC_SET = new Set<string>(TAG_NUMERIC_KEYS);

export const TAG_EXAMPLE_BY_KEY: Record<string, string> = {
  studio: "studio=mappa|ufotable",
  genre: "genre=action|drama",
  type: "type=anime|movie",
  status: "status=watching|planned",
  priority: "priority=high|normal",
  provider: "provider=anilist|tmdb",
  source: "source=tmdb|custom",
  tag: "tag=fantasy|romance",
};
