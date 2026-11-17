import * as z from "zod/mini";

const DailyModeSchema = z.enum(["frames", "op", "audio"]);
const DailyGameStateSchema = z.enum(["pending", "ready", "failed"]);

const DailyAnswerSchema = z.object({
  mediaId: z.number(),
  title: z.string(),
  year: z.nullable(z.number()),
  format: z.nullable(z.string()),
  episodes: z.nullable(z.number()),
  genres: z.array(z.string()),
  studio: z.nullable(z.string()),
  score: z.nullable(z.number()),
  source: z.nullable(z.string()),
});

const DailyResultViewSchema = z.object({
  won: z.boolean(),
  attempts: z.number(),
  answer: DailyAnswerSchema,
  rewardPackId: z.nullable(z.string()),
});

const DailyModeViewSchema = z.object({
  mode: DailyModeSchema,
  state: DailyGameStateSchema,
  attempts: z.number(),
  maxAttempts: z.number(),
  error: z.nullable(z.string()),
  result: z.nullable(DailyResultViewSchema),
});

export const DailyBootstrapSchema = z.compile(
  z.object({
    day: z.string(),
    modes: z.array(DailyModeViewSchema),
    streak: z.number(),
  })
);

const DailyFrameViewSchema = z.object({
  slot: z.number(),
  dataUrl: z.string(),
  hintKind: z.string(),
  hintValue: z.string(),
});

export const DailyFramesViewSchema = z.compile(
  z.object({
    day: z.string(),
    mode: DailyModeSchema,
    attempts: z.number(),
    maxAttempts: z.number(),
    revealed: z.number(),
    frames: z.array(DailyFrameViewSchema),
    result: z.nullable(DailyResultViewSchema),
  })
);

const DailySearchEntrySchema = z.object({
  mediaId: z.number(),
  title: z.string(),
  year: z.nullable(z.number()),
  format: z.nullable(z.string()),
  popularity: z.number(),
});

export const DailySearchIndexSchema = z.compile(z.array(DailySearchEntrySchema));

const DailyHintViewSchema = z.object({
  slot: z.number(),
  hintKind: z.string(),
  hintValue: z.string(),
});

const DailyOpViewShape = z.object({
  day: z.string(),
  mode: DailyModeSchema,
  attempts: z.number(),
  maxAttempts: z.number(),
  revealed: z.number(),
  clipPath: z.string(),
  fullPath: z.string(),
  startFraction: z.number(),
  themeType: z.string(),
  hints: z.array(DailyHintViewSchema),
  result: z.nullable(DailyResultViewSchema),
});

export const DailyOpViewSchema = z.compile(DailyOpViewShape);

export const DailyOpGuessViewSchema = z.compile(
  z.object({
    correct: z.boolean(),
    sameFranchise: z.boolean(),
    finished: z.boolean(),
    state: DailyOpViewShape,
  })
);

export const DailyHistorySchema = z.compile(
  z.array(
    z.object({
      day: z.string(),
      mode: DailyModeSchema,
      won: z.boolean(),
      attempts: z.number(),
      maxAttempts: z.number(),
      mediaId: z.nullable(z.number()),
      title: z.string(),
      playedAt: z.number(),
    })
  )
);

export const DailyGuessViewSchema = z.compile(
  z.object({
    correct: z.boolean(),
    sameFranchise: z.boolean(),
    attempts: z.number(),
    maxAttempts: z.number(),
    revealed: z.number(),
    finished: z.boolean(),
    frame: z.nullable(DailyFrameViewSchema),
    result: z.nullable(DailyResultViewSchema),
  })
);
