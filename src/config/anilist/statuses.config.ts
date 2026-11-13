import * as z from "zod/mini";

import data from "./statuses.data.json";

const StatusesDataSchema = z.object({
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

export const STATUS_TAB_WIDTH = parsed.statusTabWidth;
export const STATUS_SHRINK_AT = parsed.statusShrinkAt;
export const STATUS_SHRINK_MIN_AT = parsed.statusShrinkMinAt;
export const STATUS_SHRINK_CLASS = parsed.statusShrinkClass;
