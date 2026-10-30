import {
  buildTree,
  findFolderContainingFile,
  folderFilePaths,
} from "@/lib/player/playerTree.utils";
import { normalizePath } from "@/lib/core/pathsWatcher.utils";
import type { VideoFileEntry } from "@/types/core/fs";
import type { PlannedInsert } from "@/types/core/livePlaylist";

export function planLiveInserts(
  desired: string[],
  live: string[],
  anchor: string
): PlannedInsert[] {
  const working = [...live];
  const workingKeys = live.map(normalizePath);
  if (!workingKeys.includes(normalizePath(anchor))) return [];
  const desiredKeys = desired.map(normalizePath);
  const ops: PlannedInsert[] = [];
  for (let d = 0; d < desired.length; d++) {
    const path = desired[d];
    const key = desiredKeys[d];
    if (workingKeys.includes(key)) continue;
    let at = -1;
    for (let p = d - 1; p >= 0; p--) {
      const predecessor = workingKeys.indexOf(desiredKeys[p]);
      if (predecessor !== -1) {
        at = predecessor + 1;
        break;
      }
    }
    if (at === -1) {
      for (let s = d + 1; s < desired.length; s++) {
        const successor = workingKeys.indexOf(desiredKeys[s]);
        if (successor !== -1) {
          at = successor;
          break;
        }
      }
    }
    if (at === -1) at = working.length;
    working.splice(at, 0, path);
    workingKeys.splice(at, 0, key);
    ops.push({ path, index: at });
  }
  return ops;
}

export function planLiveRemovals(previous: string[], desired: string[], live: string[]): number[] {
  const previousKeys = new Set(previous.map(normalizePath));
  const desiredKeys = new Set(desired.map(normalizePath));
  const removals: number[] = [];
  live.forEach((path, index) => {
    const key = normalizePath(path);
    if (previousKeys.has(key) && !desiredKeys.has(key)) removals.push(index);
  });
  return removals.sort((a, b) => b - a);
}

export function desiredFolderPlaylist(
  entries: VideoFileEntry[],
  root: string,
  anchor: string
): string[] | null {
  const folder = findFolderContainingFile(buildTree(entries, root), anchor);
  if (!folder) return null;
  return folderFilePaths(folder);
}
