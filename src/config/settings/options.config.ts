import * as z from "zod/mini";

import type { TranslationKey } from "@/types/core/i18n";
import data from "./options.data.json";

const OptionItemSchema = z.object({ label: z.string(), value: z.string() });

const OptionsDataSchema = z.object({
  FORMAT_OPTIONS: z.array(OptionItemSchema),
  FPS_OPTIONS: z.array(OptionItemSchema),
  GPU_LABELS: z.record(z.string(), z.string()),
  QUALITY_OPTIONS: z.array(OptionItemSchema),
  RESOLUTIONS: z.array(OptionItemSchema),
  TABS: z.array(z.object({ id: z.enum(["upscale", "convert"]), label: z.string() })),
  UPSCALER_OPTIONS: z.array(OptionItemSchema),
  VIDEO_CODEC_OPTIONS: z.array(OptionItemSchema),
});

const parsed = OptionsDataSchema.parse(data);

export const GPU_LABELS = parsed.GPU_LABELS as Record<string, string>;
export const RESOLUTIONS = parsed.RESOLUTIONS;
export const FPS_OPTIONS = parsed.FPS_OPTIONS;
export const QUALITY_OPTIONS = parsed.QUALITY_OPTIONS;
export const UPSCALER_OPTIONS = parsed.UPSCALER_OPTIONS;
export const VIDEO_CODEC_OPTIONS = parsed.VIDEO_CODEC_OPTIONS;
export const FORMAT_OPTIONS = parsed.FORMAT_OPTIONS;
export const TABS = parsed.TABS as { id: "upscale" | "convert"; label: TranslationKey }[];