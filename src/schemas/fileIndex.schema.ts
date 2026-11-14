import * as z from "zod/mini";

const FileEntrySchema = z.object({
  path: z.string(),
  name: z.string(),
  size: z.number(),
});

export const FileEntryListSchema = z.compile(z.array(FileEntrySchema));

export const FolderScanResultListSchema = z.compile(
  z.array(
    z.object({
      path: z.string(),
      entries: z.array(FileEntrySchema),
      skipped: z.number(),
    })
  )
);

export const SidecarTrackListSchema = z.compile(
  z.array(
    z.object({
      path: z.string(),
      name: z.string(),
      kind: z.enum(["audio", "sub"]),
    })
  )
);
