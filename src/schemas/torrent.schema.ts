import * as z from "zod/mini";

const TorrentInfoSchema = z.looseObject({
  id: z.number(),
  name: z.string(),
  info_hash: z.string(),
  total_bytes: z.number(),
  progress_bytes: z.number(),
  state: z.string(),
  finished: z.boolean(),
  save_dir: z.string(),
  sequential_download: z.boolean(),
});

const TorrentDetailFileSchema = z.looseObject({
  name: z.string(),
  size: z.string(),
});

export const TorrentInfoListSchema = z.compile(z.array(TorrentInfoSchema));

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
