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
const StreamOpenValue = z.looseObject({
  sourceId: z.string(),
  sourceName: z.string(),
  mediaId: z.string(),
  mediaTitle: z.string(),
  episodeId: z.string(),
  episodeNumber: z.number(),
  episodeTitle: z.string(),
  watchKey: z.string(),
  headers: z.record(z.string(), z.string()),
  quality: z.string(),
  variantId: z.string(),
  mediaUrl: z.string(),
  sources: z.array(
    z.object({ url: z.string(), type: z.string(), quality: z.string(), label: z.string() })
  ),
  slug: z.optional(z.string()),
  cover: z.optional(z.string()),
  anilistId: z.optional(z.nullable(z.number())),
  resume: z.optional(z.number()),
  proxyUrl: z.optional(z.nullable(z.string())),
  paused: z.optional(z.boolean()),
  variants: z.optional(
    z.array(
      z.looseObject({
        id: z.string(),
        name: z.string(),
        player: z.string(),
        separateStream: z.boolean(),
        sourceUrl: z.string(),
        language: z.optional(
          z.pipe(
            z.nullable(z.string()),
            z.transform((value) => value ?? undefined)
          )
        ),
      })
    )
  ),
});
export const OpenRequestSchema = z.compile(
  z.looseObject({
    files: z.array(z.string()),
    requestId: z.optional(z.number()),
    resume: z.optional(z.number()),
    startIndex: z.optional(z.number()),
    stream: z.optional(z.nullable(StreamOpenValue)),
    watch: z.optional(
      z.nullable(
        z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("folder"), root: z.string(), anchor: z.string() }),
          z.object({
            kind: z.literal("torrent"),
            torrentId: z.number(),
            saveDir: z.string(),
            anchor: z.string(),
          }),
        ])
      )
    ),
  })
);
export const PendingOpenSchema = z.compile(z.nullable(OpenRequestSchema));
export const PlaybackSnapshotSchema = z.compile(
  z.looseObject({
    timePos: z.number(),
    duration: z.number(),
    pause: z.boolean(),
    eofReached: z.boolean(),
    speed: z.number(),
    volume: z.number(),
    muted: z.boolean(),
    playlistIndex: z.number(),
    playlistCount: z.number(),
    path: z.string(),
    fpsRender: z.optional(z.number()),
    fpsVideo: z.optional(z.number()),
    dropCount: z.optional(z.number()),
    cacheDuration: z.optional(z.number()),
    cacheBufferingState: z.optional(z.number()),
    cacheSpeed: z.optional(z.number()),
    cacheBytes: z.optional(z.number()),
    cacheStart: z.optional(z.number()),
    cacheEnd: z.optional(z.number()),
    cacheIdle: z.optional(z.boolean()),
    pausedForCache: z.optional(z.boolean()),
    seekableRanges: z.optional(z.array(z.object({ start: z.number(), end: z.number() }))),
    hwdecCurrent: z.optional(z.string()),
    videoWidth: z.optional(z.number()),
    videoHeight: z.optional(z.number()),
  })
);
export const PlaybackTracksSchema = z.compile(
  z.array(
    z.looseObject({
      id: z.number(),
      type: z.enum(["video", "audio", "sub"]),
      title: z.optional(z.string()),
      lang: z.optional(z.string()),
      codec: z.optional(z.string()),
      selected: z.optional(z.boolean()),
      external: z.optional(z.boolean()),
      default: z.optional(z.boolean()),
      forced: z.optional(z.boolean()),
      "external-filename": z.optional(z.string()),
    })
  )
);
export const PlaybackChaptersSchema = z.compile(
  z.array(z.looseObject({ title: z.string(), time: z.number(), end: z.optional(z.number()) }))
);
export const PlaybackEventSchema = z.compile(
  z.looseObject({
    kind: z.enum([
      "file-loaded",
      "end-file",
      "idle",
      "shutdown",
      "seek",
      "playback-restart",
      "error",
      "video-reconfig",
      "audio-reconfig",
      "dropped-frames",
    ]),
    path: z.optional(z.string()),
    reason: z.optional(z.string()),
    data: z.optional(z.unknown()),
  })
);
export const SavedFrameSchema = z.compile(z.object({ path: z.string() }));
export const MpvDoubleSchema = z.compile(z.nullable(z.number()));
export const MpvFlagSchema = z.compile(z.nullable(z.boolean()));
export const MpvInt64Schema = z.compile(z.nullable(z.number()));
export const MpvStringSchema = z.compile(z.nullable(z.string()));
