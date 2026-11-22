import * as z from "zod/mini";

const TorrentInfoSchema = z.looseObject({
  id: z.number(),
  name: z.string(),
  info_hash: z.string(),
  total_bytes: z.number(),
  progress_bytes: z.number(),
  uploaded_bytes: z.number(),
  share_ratio: z.number(),
  download_speed: z.number(),
  upload_speed: z.number(),
  peers_connected: z.number(),
  progress: z.number(),
  state: z.string(),
  eta_secs: z.nullable(z.number()),
  finished: z.boolean(),
  error: z.nullable(z.string()),
  save_dir: z.string(),
  sequential_download: z.boolean(),
  sequential_file: z.nullable(z.number()),
  download_order: z.array(z.number()),
  missing_files: z.boolean(),
  external_changes: z.boolean(),
  external_changed_files: z.array(z.string()),
  checking_file: z.optional(z.nullable(z.string())),
  disk_sparse: z.optional(z.nullable(z.boolean())),
});

const TorrentDetailFileSchema = z.looseObject({
  name: z.string(),
  size: z.string(),
});

export const TorrentInfoListSchema = z.compile(z.array(TorrentInfoSchema));

export const TorrentUpdateSchema = z.compile(
  z.object({
    updates: z.array(TorrentInfoSchema),
    removed: z.array(z.number()),
    reset: z.boolean(),
  })
);

export const TorrentDetailsSchema = z.compile(
  z.looseObject({
    source: z.string(),
    url: z.string(),
    title: z.string(),
    description: z.string(),
    files: z.array(TorrentDetailFileSchema),
    screenshots: z.array(z.string()),
  })
);
