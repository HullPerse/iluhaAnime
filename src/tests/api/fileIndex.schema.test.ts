import { describe, expect, it } from "vitest";

import {
  FileEntryListSchema,
  FolderScanResultListSchema,
  SidecarTrackListSchema,
} from "@/api/fileIndex.schema";
import {
  PendingOpenSchema,
  SavedFrameSchema,
  WatchStateSchema,
} from "@/api/player.schema";

describe("player and file-index schemas", () => {
  it("accepts file entries and rejects a missing size", () => {
    expect(FileEntryListSchema.safeParse([{ path: "a.mkv", name: "a", size: 1 }]).success).toBe(
      true
    );
    expect(FileEntryListSchema.safeParse([{ path: "a.mkv", name: "a" }]).success).toBe(false);
  });

  it("validates folder scans", () => {
    expect(
      FolderScanResultListSchema.safeParse([
        { path: "D:/anime", entries: [{ path: "a.mkv", name: "a", size: 1 }], skipped: 0 },
      ]).success
    ).toBe(true);
  });

  it("validates sidecar track kinds", () => {
    expect(
      SidecarTrackListSchema.safeParse([{ path: "a.ass", name: "a", kind: "sub" }]).success
    ).toBe(true);
    expect(
      SidecarTrackListSchema.safeParse([{ path: "a.ass", name: "a", kind: "video" }]).success
    ).toBe(false);
  });

  it("accepts a missing watch state or a complete one", () => {
    expect(WatchStateSchema.safeParse(null).success).toBe(true);
    expect(
      WatchStateSchema.safeParse({ position: 1, duration: 2, updatedAt: 3 }).success
    ).toBe(true);
    expect(WatchStateSchema.safeParse({ position: 1, duration: 2 }).success).toBe(false);
  });

  it("accepts a pending open only when it has files", () => {
    expect(PendingOpenSchema.safeParse(null).success).toBe(true);
    expect(PendingOpenSchema.safeParse({ files: [] }).success).toBe(true);
    expect(PendingOpenSchema.safeParse({}).success).toBe(false);
  });

  it("validates the saved-frame path", () => {
    expect(SavedFrameSchema.safeParse({ path: "frame.png" }).success).toBe(true);
    expect(SavedFrameSchema.safeParse({}).success).toBe(false);
  });
});
