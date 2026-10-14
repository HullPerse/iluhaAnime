import type { FolderChange } from "@/types/watcher";

function extensionOf(path: string): string {
  const name = path.replaceAll("\\", "/").split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

function extensionSet(extensions: string[]): Set<string> {
  return new Set(
    extensions.map((ext) => ext.trim().replace(/^\./, "").toLowerCase()).filter(Boolean)
  );
}

/**
 * True when at least one changed path carries one of `extensions`. Lets
 * consumers skip a whole-folder rescan for changes that cannot affect their
 * video-only view (a cover image, a `.nfo`, a lock file...).
 */
export function touchesExtensions(changes: FolderChange[], extensions: string[]): boolean {
  if (changes.length === 0) return false;
  const wanted = extensionSet(extensions);
  return changes.some((change) => wanted.has(extensionOf(change.path)));
}

/**
 * The batch, when every change in it is a video file the player tracks.
 * Such a batch can be applied entry by entry (point update of the index and
 * the tree). Anything else returns `null`: a folder was created, renamed or
 * removed, or a non-video path moved, and only a full walk of the root can
 * tell what happened.
 */
export function patchableVideoChanges(
  changes: FolderChange[],
  extensions: string[]
): FolderChange[] | null {
  if (changes.length === 0) return null;
  const wanted = extensionSet(extensions);
  return changes.every((change) => wanted.has(extensionOf(change.path))) ? changes : null;
}
