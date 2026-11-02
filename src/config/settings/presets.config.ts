import * as z from "zod/mini";

import data from "./presets.data.json";

const Anime4kPresetSchema = z.object({
  gpuBackend: z.string(),
  label: z.string(),
  quality: z.string(),
  shaders: z.array(z.string()),
  value: z.string(),
});

const PresetsDataSchema = z.object({
  ANIME4K_PRESETS: z.array(Anime4kPresetSchema),
});

const parsed = PresetsDataSchema.parse(data);

export const ANIME4K_PRESETS = parsed.ANIME4K_PRESETS as {
  label: string;
  value: string;
  shaders: string[];
  quality: string;
  gpuBackend: string;
}[];