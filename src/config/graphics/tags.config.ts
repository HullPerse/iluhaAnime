import * as z from "zod/mini";

import data from "./tags.data.json";

const TagsDataSchema = z.object({
  TAG_DEFAULT_VALUE_BY_KEY: z.record(z.string(), z.string()),
  TAG_EXAMPLE_BY_KEY: z.record(z.string(), z.string()),
  TAG_NUMERIC_KEYS: z.array(z.string()),
  TAG_NUMERIC_SET: z.array(z.string()),
  TAG_OPS_BY_KEY: z.record(z.string(), z.string()),
});

const parsed = TagsDataSchema.parse(data);

export const TAG_NUMERIC_KEYS = parsed.TAG_NUMERIC_KEYS as ("year" | "rating" | "episodes" | "progress")[];
export const TAG_NUMERIC_SET = new Set<string>(parsed.TAG_NUMERIC_SET);
export const TAG_DEFAULT_VALUE_BY_KEY = parsed.TAG_DEFAULT_VALUE_BY_KEY as Record<string, string>;
export const TAG_EXAMPLE_BY_KEY = parsed.TAG_EXAMPLE_BY_KEY as Record<string, string>;
export const TAG_OPS_BY_KEY = parsed.TAG_OPS_BY_KEY as Record<string, string>;