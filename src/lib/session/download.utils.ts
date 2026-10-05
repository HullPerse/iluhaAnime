import type { TorrentFileInfo } from "@/types/torrent";

/**
 * Join a torrent save dir, an optional sub-folder, and a torrent-relative
 * file name into the absolute on-disk path. librqbit joins files straight
 * onto the output folder, so `saveDir[/subFolder]/name` is where the bytes
 * land (`manager.rs` `output_folder`). Forward slashes survive the trip to
 * the Rust side on Windows.
 */
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

/** True when the file name ends with a known video extension. */
export function isVideoFile(name: string, videoExtensions: readonly string[]): boolean {
  const lower = name.toLowerCase();
  return videoExtensions.some((extension) => {
    const suffix = extension.startsWith(".")
      ? extension.toLowerCase()
      : `.${extension.toLowerCase()}`;
    return lower.endsWith(suffix);
  });
}

/**
 * Pick which downloaded file verifies a plan item. A byte-size match wins
 * (a plan item is a single file); otherwise the largest video in the
 * download selection; `null` when there is nothing to check.
 */
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

/** librqbit selection: everything selected means no restriction. */
export function resolveOnlyFiles(
  all: readonly { index: number }[],
  selected: readonly number[]
): number[] | null {
  return selected.length === all.length ? null : [...selected];
}
