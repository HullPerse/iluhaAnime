import * as z from "zod/mini";

export const GpuEncodersSchema = z.compile(z.array(z.string()));
export const Anime4kShadersSchema = z.compile(z.array(z.string()));
export const UpscalePresetSuggestionSchema = z.compile(
  z.object({ preset: z.string(), reason: z.string() })
);
export const UpscaleTimeEstimateSchema = z.compile(z.object({ seconds: z.number() }));
export const PreviewFrameListSchema = z.compile(
  z.array(z.object({ timestamp: z.number(), before: z.string(), after: z.string() }))
);
export const ShaderInfoListSchema = z.compile(
  z.array(
    z.object({
      id: z.string(),
      filename: z.string(),
      category: z.string(),
      description: z.string(),
      speed_factor: z.number(),
      is_default: z.boolean(),
      exclusive_group: z.nullable(z.string()),
      available: z.boolean(),
    })
  )
);
