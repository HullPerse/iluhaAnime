import { describe, expect, it } from "vitest";

import { diffFolderSnapshot } from "@/lib/player/folder.utils";

describe("diffFolderSnapshot", () => {
  it("seeds a never-seen folder silently", () => {
    const { fresh, next } = diffFolderSnapshot(null, "/anime", ["a.mkv", "b.mkv"]);
    expect(fresh).toEqual([]);
    expect(next["/anime"]).toEqual(["a.mkv", "b.mkv"]);
  });

  it("seeds a new path without notifying about its files", () => {
    const { fresh, next } = diffFolderSnapshot({ "/a": ["x.mkv"] }, "/b", ["y.mkv"]);
    expect(fresh).toEqual([]);
    expect(next["/a"]).toEqual(["x.mkv"]);
    expect(next["/b"]).toEqual(["y.mkv"]);
  });

  it("reports only files missing from the snapshot", () => {
    const { fresh, next } = diffFolderSnapshot({ "/anime": ["a.mkv"] }, "/anime", [
      "a.mkv",
      "b.mkv",
    ]);
    expect(fresh).toEqual(["b.mkv"]);
    expect(next["/anime"]).toEqual(["a.mkv", "b.mkv"]);
  });

  it("reports nothing when nothing changed", () => {
    const snapshot = { "/anime": ["a.mkv", "b.mkv"] };
    const { fresh, next } = diffFolderSnapshot(snapshot, "/anime", ["b.mkv", "a.mkv"]);
    expect(fresh).toEqual([]);
    expect(next["/anime"]).toEqual(["a.mkv", "b.mkv"]);
  });

  it("shrinks the snapshot on deletions without reporting", () => {
    const { fresh, next } = diffFolderSnapshot({ "/anime": ["a.mkv", "b.mkv"] }, "/anime", [
      "a.mkv",
    ]);
    expect(fresh).toEqual([]);
    expect(next["/anime"]).toEqual(["a.mkv"]);
  });

  it("keeps other folders untouched", () => {
    const { next } = diffFolderSnapshot({ "/a": ["x.mkv"], "/b": ["y.mkv"] }, "/a", [
      "x.mkv",
      "z.mkv",
    ]);
    expect(next["/b"]).toEqual(["y.mkv"]);
  });
});
