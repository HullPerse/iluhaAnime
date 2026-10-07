import { describe, expect, it } from "vitest";

import { findUpdatedFiles, normalizeUpdateFileName } from "@/lib/torrent/update.utils";
import type { TorrentFileInfo } from "@/types/torrent";

function file(name: string): TorrentFileInfo {
  return {
    index: 0,
    name,
    size: 100,
    progress_bytes: 100,
    completed: true,
    selected: true,
    priority: "normal",
    exists: true,
  };
}

describe("findUpdatedFiles", () => {
  it("normalizes separators, case, and whitespace", () => {
    expect(normalizeUpdateFileName("Dir\\Ep  01.MKV")).toBe("dir/ep 01.mkv");
  });

  it("returns only files missing from the torrent", () => {
    const torrent = [file("[Group] Show/01.mkv"), file("[Group] Show/02.mkv")];
    const detail = [
      { name: "[Group] Show/02.mkv", size: "1 GiB" },
      { name: "[Group] Show/03.mkv", size: "1 GiB" },
    ];
    expect(findUpdatedFiles(torrent, detail)).toEqual([
      { name: "[Group] Show/03.mkv", size: "1 GiB" },
    ]);
  });

  it("matches by basename when folders differ", () => {
    const torrent = [file("Show/01.mkv")];
    const detail = [{ name: "Other/01.mkv", size: "1 GiB" }];
    expect(findUpdatedFiles(torrent, detail)).toEqual([]);
  });

  it("skips empty names", () => {
    expect(findUpdatedFiles([file("a.mkv")], [{ name: "  ", size: "" }])).toEqual([]);
  });
});
