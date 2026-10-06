import type { TorrentFileInfo } from "@/types/torrent";

// Mirrors manager.rs output_folder; forward slashes survive on Windows.
export function joinSavePath(
  saveDir: string,
  subFolder: string | null | undefined,
  name: string
): string {
  const base = saveDir.replace(/[\\/]+$/, "");
  const root = subFolder ? `${base}/${subFolder}` : base;
  const relative = name.replace(/^[\\/]+/, "");
  return `${root}/${relative}`;
}

export function isVideoFile(name: string, videoExtensions: readonly string[]): boolean {
  const lower = name.toLowerCase();
  return videoExtensions.some((extension) => {
    const suffix = extension.startsWith(".")
      ? extension.toLowerCase()
      : `.${extension.toLowerCase()}`;
    return lower.endsWith(suffix);
  });
}

// Byte-size match wins, else largest video.
export function pickVerifyFile(
  files: readonly TorrentFileInfo[],
  identitySize: number,
  videoExtensions: readonly string[],
  selected: readonly number[] | null
): TorrentFileInfo | null {
  const scoped =
    selected === null ? [...files] : files.filter((file) => selected.includes(file.index));
  const pool = scoped.length > 0 ? scoped : [...files];
  const videos = pool.filter((file) => isVideoFile(file.name, videoExtensions));
  const candidates = videos.length > 0 ? videos : pool;
  if (candidates.length === 0) return null;
  return (
    candidates.find((file) => file.size === identitySize) ??
    candidates.reduce((a, b) => (b.size > a.size ? b : a))
  );
}

export function resolveOnlyFiles(
  all: readonly { index: number }[],
  selected: readonly number[]
): number[] | null {
  return selected.length === all.length ? null : [...selected];
}
