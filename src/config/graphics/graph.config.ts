import * as z from "zod/mini";

import type { TranslationKey } from "@/types/core/i18n";
import data from "./graph.data.json";

const GraphDataSchema = z.object({
  EDGE_STYLES: z.record(
    z.string(),
    z.object({ color: z.string(), dash: z.string(), width: z.number() })
  ),
  FILTER_GROUPS: z.record(z.string(), z.array(z.string())),
  FILTER_LABELS: z.record(z.string(), z.string()),
  FORMAT_SHORT: z.record(z.string(), z.string()),
  FRANCHISE_VIEWPORT: z.object({
    initialScale: z.number(),
    maxScale: z.number(),
    minScale: z.number(),
    wheelStep: z.number(),
  }),
  IMG_H: z.number(),
  NODE_BORDER_COLORS: z.record(z.string(), z.string()),
  NODE_H: z.number(),
  NODE_SCALE_TIERS: z.array(z.object({ above: z.number(), scale: z.number() })),
  NODE_W: z.number(),
  RELATION_FILTERS: z.tuple([
    z.literal("SEQUEL"),
    z.literal("PREQUEL"),
    z.literal("SIDE_STORY"),
    z.literal("SPIN_OFF"),
    z.literal("OTHER"),
  ]),
  RELATION_X: z.record(z.string(), z.number()),
});

const parsed = GraphDataSchema.parse(data);

export const NODE_W = parsed.NODE_W;
export const NODE_H = parsed.NODE_H;
export const IMG_H = parsed.IMG_H;

export const NODE_SCALE_TIERS = parsed.NODE_SCALE_TIERS as readonly {
  above: number;
  scale: number;
}[];

export const FRANCHISE_VIEWPORT = parsed.FRANCHISE_VIEWPORT as {
  initialScale: number;
  maxScale: number;
  minScale: number;
  wheelStep: number;
};

export const RELATION_FILTERS = parsed.RELATION_FILTERS;

export const FILTER_GROUPS = parsed.FILTER_GROUPS as Record<string, string[]>;

export const EDGE_STYLES = parsed.EDGE_STYLES as Record<
  string,
  { color: string; dash: string; width: number }
>;

export const NODE_BORDER_COLORS = parsed.NODE_BORDER_COLORS as Record<string, string>;

export const FILTER_LABELS = parsed.FILTER_LABELS as Record<string, TranslationKey>;

export const RELATION_X = parsed.RELATION_X as Record<string, number>;

export const FORMAT_SHORT = parsed.FORMAT_SHORT as Record<string, string>;
