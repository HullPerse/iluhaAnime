import { fileNameFromPath, isTrackFileName } from "@/lib/media/parse.utils";
import { normalizePath, samePath } from "@/lib/watcher/paths.watcher";
import type { TorrentFileInfo, TorrentStream } from "@/types/torrent";
import type { PlayerSource, PlaylistWatch } from "@/types/videoPlayer";

const COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** A loopback stream URL, as opposed to a local file path. */
export function isStreamTarget(target: string): boolean {
  const lowered = target.toLowerCase();
  return lowered.startsWith("http://") || lowered.startsWith("https://");
}

export function sourceForTarget(
  sources: readonly PlayerSource[] | undefined,
  target: string
): PlayerSource | undefined {
  if (!target || !sources) return undefined;
  return sources.find((source) => source.target === target);
}

/** The watch/track key for a playlist entry. */
export function mediaKeyForTarget(
  sources: readonly PlayerSource[] | undefined,
  target: string
): string {
  return sourceForTarget(sources, target)?.path ?? target;
}

/** The playlist target for a stable path, or the path itself when it has none. */
export function targetForMediaKey(
  sources: readonly PlayerSource[] | undefined,
  key: string
): string {
  if (!key || !sources) return key;
  return sources.find((source) => samePath(source.path, key))?.target ?? key;
}

export function isVideoFileName(name: string, extensions: readonly string[]): boolean {
  const base = fileNameFromPath(name).toLowerCase();
  return extensions.some((extension) => base.endsWith(`.${extension.toLowerCase()}`));
}

/** True when the current playlist target is a loopback stream. */
export function isStreamingTarget(
  sources: readonly PlayerSource[] | undefined,
  target: string
): boolean {
  if (!target || !sources) return false;
  return sources.some((source) => source.streaming && source.target === target);
}

/** The torrent id behind a watch, when the watch belongs to a torrent. */
export function liveTorrentId(watch: PlaylistWatch | null | undefined): number | undefined {
  if (watch?.kind !== "torrent") return undefined;
  return watch.torrentId;
}

/**
 * Card previews need real files: probing a stream URL would open a second
 * engine reader just for a thumbnail.
 */
export function cardPlaylistEntries(
  entries: ReadonlyArray<{ filename: string }>,
  activeTarget: string
): { paths: string[]; activePath: string } {
  return {
    paths: entries
      .map((entry) => entry.filename)
      .filter((name) => name !== "" && !isStreamTarget(name)),
    activePath: isStreamTarget(activeTarget) ? "" : activeTarget,
  };
}

export function streamTokens(sources: readonly PlayerSource[] | undefined): string[] {
  if (!sources) return [];
  return sources.flatMap((source) =>
    source.streaming && source.token ? [source.token] : []
  );
}

/**
 * Files worth opening for playback: finished payloads that are still on disk,
 * selected downloads, and the file the user explicitly clicked (even when it
 * was deselected, because Play means "download and watch this one").
 */
export function playableTorrentIndices(
  files: readonly TorrentFileInfo[],
  clickedIndex: number,
  trackExts?: Set<string>
): number[] {
  const indices: number[] = [];
  for (const file of files) {
    if (file.size <= 0) continue;
    if (trackExts && isTrackFileName(fileNameFromPath(file.name), trackExts)) continue;
    // A finished payload that vanished from disk cannot be streamed either.
    if (file.completed && !file.exists) continue;
    if (file.completed || file.selected || file.index === clickedIndex) {
      indices.push(file.index);
    }
  }
  return [...new Set(indices)];
}

export interface TorrentPlaybackPlan {
  files: string[];
  sources: PlayerSource[];
  startIndex: number;
}

/**
 * Desired playlist targets for live sync: the prepared sources plus any extra
 * local files, deduplicated and ordered by stable path.
 */
export function torrentPlaybackTargets(
  sources: readonly PlayerSource[],
  extras: readonly string[] = []
): string[] {
  const entries = [
    ...sources.map((source) => ({ target: source.target, path: source.path })),
    ...extras
      .filter((path) => path.trim() !== "")
      .map((path) => ({ target: path, path })),
  ];
  const seen = new Set<string>();
  const unique = entries.filter((entry) => {
    const key = normalizePath(entry.target);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  unique.sort((left, right) => COLLATOR.compare(left.path, right.path));
  return unique.map((entry) => entry.target);
}

/**
 * Build the mpv playlist from the prepared streams plus extra local files.
 * Order is by stable path, not by URL, so the season keeps its episode order.
 */
export function buildTorrentPlaybackPlan(
  streams: readonly TorrentStream[],
  clickedPath: string,
  extras: readonly string[] = []
): TorrentPlaybackPlan | null {
  const sources: PlayerSource[] = streams.map((stream) => ({
    target: stream.target,
    path: stream.path,
    name: stream.name,
    streaming: stream.streaming,
    fileIndex: stream.fileIndex,
    token: stream.token ?? undefined,
  }));
  for (const path of extras) {
    if (!path || path.trim() === "") continue;
    sources.push({
      target: path,
      path,
      name: fileNameFromPath(path),
      streaming: false,
    });
  }

  const seen = new Set<string>();
  const unique = sources.filter((source) => {
    const key = normalizePath(source.target);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (unique.length === 0) return null;

  unique.sort((left, right) => COLLATOR.compare(left.path, right.path));
  const startIndex = unique.findIndex((source) => samePath(source.path, clickedPath));
  if (startIndex === -1) return null;

  return {
    files: unique.map((source) => source.target),
    sources: unique,
    startIndex,
  };
}
