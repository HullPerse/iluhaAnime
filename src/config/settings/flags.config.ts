import * as z from "zod/mini";

import data from "./flags.data.json";

const FlagsDataSchema = z.object({
  FLAG_CELL_HEIGHT: z.number(),
  FLAG_CELL_WIDTH: z.number(),
  FLAG_CELLS: z.record(z.string(), z.tuple([z.number(), z.number()])),
  FLAG_SHEET_HEIGHT: z.number(),
  FLAG_SHEET_WIDTH: z.number(),
  FLAG_SPRITE_PATH: z.string(),
});

const parsed = FlagsDataSchema.parse(data);

export const FLAG_CELL_HEIGHT = parsed.FLAG_CELL_HEIGHT;
export const FLAG_CELL_WIDTH = parsed.FLAG_CELL_WIDTH;
export const FLAG_CELLS = parsed.FLAG_CELLS as Record<string, readonly [number, number]>;
export const FLAG_SHEET_HEIGHT = parsed.FLAG_SHEET_HEIGHT;
export const FLAG_SHEET_WIDTH = parsed.FLAG_SHEET_WIDTH;
export const FLAG_SPRITE_PATH = parsed.FLAG_SPRITE_PATH;