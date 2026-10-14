import { describe, expect, it } from "vitest";

import { patchableVideoChanges, touchesExtensions } from "@/lib/watcher/changes.watcher";
import type { FolderChange } from "@/types/watcher";

function change(path: string, kind: FolderChange["kind"] = "created"): FolderChange {
  return { path, root: "C:/F", kind };
}

describe("touchesExtensions", () => {
  it("is true when a changed path carries a wanted extension", () => {
    expect(touchesExtensions([change("C:/F/ep01.mkv")], ["mp4", "mkv"])).toBe(true);
  });

  it("is false for changes outside the wanted extensions", () => {
    expect(touchesExtensions([change("C:/F/cover.jpg"), change("C:/F/info.nfo")], ["mkv"])).toBe(
      false
    );
  });

  it("matches across separators, case and a leading dot in the list", () => {
    expect(touchesExtensions([change("C:\\F\\EP01.MKV")], [".mkv"])).toBe(true);
  });

  it("ignores the change kind", () => {
    expect(touchesExtensions([change("C:/F/ep01.mp4", "removed")], ["mp4"])).toBe(true);
  });

  it("is false for an empty batch or a file without extension", () => {
    expect(touchesExtensions([], ["mkv"])).toBe(false);
    expect(touchesExtensions([change("C:/F/README")], ["mkv"])).toBe(false);
  });
});

describe("patchableVideoChanges", () => {
  it("keeps a batch made only of tracked video files", () => {
    const batch = [
      change("C:/F/ep01.mkv", "created"),
      change("C:/F/ep02.mp4", "removed"),
      change("C:\\F\\ep03.MKV", "modified"),
    ];
    expect(patchableVideoChanges(batch, ["mkv", "mp4"])).toBe(batch);
  });

  it("rejects a batch that contains a folder, a non-video file or an unknown extension", () => {
    const options = ["mkv"];
    expect(
      patchableVideoChanges([change("C:/F/ep01.mkv"), change("C:/F/Season 2")], options)
    ).toBeNull();
    expect(
      patchableVideoChanges([change("C:/F/ep01.mkv"), change("C:/F/poster.jpg")], options)
    ).toBeNull();
    expect(patchableVideoChanges([change("C:/F/ep01.avi")], options)).toBeNull();
  });

  it("rejects an empty batch", () => {
    expect(patchableVideoChanges([], ["mkv"])).toBeNull();
  });
});
