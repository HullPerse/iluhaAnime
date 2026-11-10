import * as z from "zod/mini";

import type { CollectionStatusDef } from "@/types/anilist/collection";
import data from "./statuses.data.json";

const CollectionStatusDefSchema = z.object({
  id: z.string(),
  label: z.string(),
  color: z.string(),
  order: z.number(),
  isCore: z.boolean(),
  kind: z.enum(["private", "public"]),
});

const StatusesDataSchema = z.object({
  defaultCollectionStatuses: z.array(CollectionStatusDefSchema),
  defaultNewColor: z.string(),
  publicStatusMaxItems: z.number(),
  statusTabWidth: z.number(),
  statusShrinkAt: z.number(),
  statusShrinkMinAt: z.number(),
  statusShrinkClass: z.tuple([
    z.literal("text-xs"),
    z.literal("text-[10px]"),
    z.literal("text-[9px]"),
  ]),
});

const parsed = StatusesDataSchema.parse(data);

export const DEFAULT_COLLECTION_STATUSES: CollectionStatusDef[] = parsed.defaultCollectionStatuses;
export const DEFAULT_NEW_COLOR = parsed.defaultNewColor;
export const PUBLIC_STATUS_MAX_ITEMS = parsed.publicStatusMaxItems;
export const STATUS_TAB_WIDTH = parsed.statusTabWidth;
export const STATUS_SHRINK_AT = parsed.statusShrinkAt;
export const STATUS_SHRINK_MIN_AT = parsed.statusShrinkMinAt;
export const STATUS_SHRINK_CLASS = parsed.statusShrinkClass;
