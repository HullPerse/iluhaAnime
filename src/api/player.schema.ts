import * as z from "zod/mini";

export const PlaylistEntryListSchema = z.compile(
  z.array(z.object({ index: z.number(), filename: z.string(), title: z.string() }))
);
export const VideoCardInfoSchema = z.compile(
  z.object({ path: z.string(), duration: z.number(), size: z.number() })
);