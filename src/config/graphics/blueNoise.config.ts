import * as z from "zod/mini";

import data from "./blueNoise.data.json";

const BlueNoiseDataSchema = z.object({
  BLUE_NOISE_64: z.array(z.number()),
});

const parsed = BlueNoiseDataSchema.parse(data);

export const BLUE_NOISE_64 = parsed.BLUE_NOISE_64 as readonly number[];
export const BLUE_NOISE_SIZE = 64;
export const BLUE_NOISE_RANGE = 4096;
