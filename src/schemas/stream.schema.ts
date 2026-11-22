import * as z from "zod/mini";

const headers = z.record(z.string(), z.string());

export const StreamSourcesSchema = z.compile(
  z.array(
    z.looseObject({
      variantId: z.string(),
      quality: z.string(),
      label: z.string(),
      url: z.string(),
      type: z.string(),
      headers,
      subtitles: z.array(
        z.looseObject({
          id: z.string(),
          url: z.string(),
          language: z.string(),
          isDefault: z.boolean(),
          headers,
        })
      ),
      audioTracks: z.array(
        z.looseObject({
          id: z.string(),
          language: z.string(),
          title: z.optional(z.nullable(z.string())),
          default: z.boolean(),
        })
      ),
    })
  )
);
