import { describe, expect, it } from "vitest";

import { buildTree, patchTreeFile, removeTreeFile } from "@/lib/player/tree.utils";
import type { VideoFileEntry } from "@/types/fs";
import type { FolderNode } from "@/types/torrent";

const ROOT = "C:/Anime/Show";

function entry(path: string, size: number): VideoFileEntry {
  const name = path.replaceAll("\\", "/").split("/").pop() as string;
  return { path, name, size };
}

function fixture(): FolderNode {
  return buildTree(
    [
      entry(`${ROOT}/ep01.mkv`, 100),
      entry(`${ROOT}/Season 2/ep02.mkv`, 200),
      entry(`${ROOT}/Season 2/ep03.mkv`, 300),
    ],
    ROOT
  );
}

/** Every file path in the tree, bottom up. */
function allPaths(node: FolderNode): string[] {
  return [...node.files.map((file) => file.path), ...node.children.flatMap(allPaths)].sort();
}

describe("patchTreeFile", () => {
  it("appends a file to an existing folder", () => {
    const patched = patchTreeFile(fixture(), entry(`${ROOT}/ep00.mkv`, 50)) as FolderNode;
    expect(allPaths(patched)).toEqual(
      [
        `${ROOT}/ep00.mkv`,
        `${ROOT}/ep01.mkv`,
        `${ROOT}/Season 2/ep02.mkv`,
        `${ROOT}/Season 2/ep03.mkv`,
      ].sort()
    );
  });

  it("replaces the size of a file that is already in the tree", () => {
    const patched = patchTreeFile(fixture(), entry(`${ROOT}/ep01.mkv`, 999)) as FolderNode;
    expect(patched.files).toHaveLength(1);
    expect(patched.files[0]?.size).toBe(999);
  });

  it("creates the missing folders for a deep path", () => {
    const patched = patchTreeFile(
      fixture(),
      entry(`${ROOT}/Season 3/OVA/ova01.mkv`, 7)
    ) as FolderNode;
    const season3 = patched.children.find((child) => child.path === `${ROOT}/Season 3`);
    expect(season3?.name).toBe("Season 3");
    expect(season3?.children[0]?.path).toBe(`${ROOT}/Season 3/OVA`);
    expect(season3?.children[0]?.files[0]?.path).toBe(`${ROOT}/Season 3/OVA/ova01.mkv`);
    expect(patched.children).toHaveLength(2);
  });

  it("accepts backslash paths and reports foreign paths as null", () => {
    const patched = patchTreeFile(fixture(), entry("C:\\Anime\\Show\\ep04.mkv", 1)) as FolderNode;
    expect(allPaths(patched)).toContain("C:\\Anime\\Show\\ep04.mkv");
    expect(patchTreeFile(fixture(), entry("C:/Other/ep.mkv", 1))).toBeNull();
  });

  it("returns a new tree instead of mutating the old one", () => {
    const original = fixture();
    const snapshot = JSON.stringify(original);
    patchTreeFile(original, entry(`${ROOT}/ep00.mkv`, 50));
    expect(JSON.stringify(original)).toBe(snapshot);
  });
});

describe("removeTreeFile", () => {
  it("drops the file from the folder it lived in", () => {
    const next = removeTreeFile(fixture(), `${ROOT}/Season 2/ep02.mkv`) as FolderNode;
    expect(allPaths(next)).toEqual([`${ROOT}/ep01.mkv`, `${ROOT}/Season 2/ep03.mkv`].sort());
  });

  it("prunes the folders it leaves empty", () => {
    const withoutOne = removeTreeFile(fixture(), `${ROOT}/Season 2/ep02.mkv`) as FolderNode;
    const emptied = removeTreeFile(withoutOne, `${ROOT}/Season 2/ep03.mkv`) as FolderNode;
    expect(allPaths(emptied)).toEqual([`${ROOT}/ep01.mkv`]);
    expect(emptied.children).toHaveLength(0);
  });

  it("reports foreign paths as null", () => {
    expect(removeTreeFile(fixture(), "C:/Other/ep01.mkv")).toBeNull();
    expect(removeTreeFile(fixture(), ROOT)).toBeNull();
  });
});
