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

export function touchesExtensions(changes: FolderChange[], extensions: string[]): boolean {
  if (changes.length === 0) return false;
  const wanted = extensionSet(extensions);
  return changes.some((change) => wanted.has(extensionOf(change.path)));
}

export function patchableVideoChanges(
  changes: FolderChange[],
  extensions: string[]
): FolderChange[] | null {
  if (changes.length === 0) return null;
  const wanted = extensionSet(extensions);
  return changes.every((change) => wanted.has(extensionOf(change.path))) ? changes : null;
}
