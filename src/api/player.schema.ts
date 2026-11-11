import * as z from "zod/mini";

export const PlaylistEntryListSchema = z.compile(
  z.array(z.object({ index: z.number(), filename: z.string(), title: z.string() }))
);
export const VideoCardInfoSchema = z.compile(
  z.object({ path: z.string(), duration: z.number(), size: z.number() })
);
export const WatchStateSchema = z.compile(
  z.nullable(
    z.looseObject({
      position: z.number(),
      duration: z.number(),
      audioDelay: z.optional(z.number()),
      subDelay: z.optional(z.number()),
      updatedAt: z.number(),
    })
  )
);
export const PendingOpenSchema = z.compile(
  z.nullable(z.looseObject({ files: z.array(z.string()) }))
);
export const SavedFrameSchema = z.compile(z.object({ path: z.string() }));
export const MpvDoubleSchema = z.compile(z.nullable(z.number()));
export const MpvFlagSchema = z.compile(z.nullable(z.boolean()));
export const MpvInt64Schema = z.compile(z.nullable(z.number()));
export const MpvStringSchema = z.compile(z.nullable(z.string()));
