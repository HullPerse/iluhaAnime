import { buildTree, findFolderContainingFile, folderFilePaths } from "@/lib/player/tree.utils";
import type { VideoFileEntry } from "@/types/fs";

export interface PlannedInsert {
  path: string;
  index: number;
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").toLowerCase();
}

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

export function desiredFolderPlaylist(
  entries: VideoFileEntry[],
  root: string,
  anchor: string
): string[] | null {
  const folder = findFolderContainingFile(buildTree(entries, root), anchor);
  if (!folder) return null;
  return folderFilePaths(folder);
}
