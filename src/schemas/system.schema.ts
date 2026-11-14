import * as z from "zod/mini";

export const DatabaseStatusSchema = z.compile(
  z.object({
    ok: z.boolean(),
    version: z.nullable(z.number()),
    dataDir: z.string(),
    error: z.nullable(z.string()),
  })
);

export const HostStatsSchema = z.compile(
  z.object({
    cpuUsage: z.number(),
    memoryUsed: z.number(),
    memoryTotal: z.number(),
    netRxBps: z.number(),
    netTxBps: z.number(),
  })
);

export const RemoteImageStatsSchema = z.compile(
  z.object({ bytes: z.number(), count: z.number() })
);

export const VideoCacheStatsSchema = z.compile(
  z.object({ hits: z.number(), misses: z.number() })
);
