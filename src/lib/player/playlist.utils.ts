import { cn } from "cn";
import { fileNameFromPath } from "@/lib/search/parse.utils";
import { formatBytes } from "@/lib/core/bytes.utils";
import { formatClock } from "@/lib/core/time.utils";
import { formatParsedTitle } from "@/lib/player/playerTitle.utils";
import type { CardArt } from "@/types/core/cardCache";
import type { PlaylistEntry } from "@/types/player/playback";
import type { TFunc } from "@/types/core/i18n";

export function resolvePlaylistDragMove(
  activeId: unknown,
  overId: unknown
): { from: number; to: number } | null {
  const from = typeof activeId === "number" ? activeId : Number(activeId);
  const to = typeof overId === "number" ? overId : Number(overId);
  if (!Number.isInteger(from) || !Number.isInteger(to)) return null;
  if (from === to) return null;
  return { from, to };
}

export function entryLabel(entry: PlaylistEntry, parseTitles: boolean, t: TFunc): string {
  if (entry.title) return entry.title;
  const name = entry.filename ? fileNameFromPath(entry.filename) : "";
  if (!name) return `#${entry.index + 1}`;
  return parseTitles && entry.filename ? formatParsedTitle(entry.filename, t) : name;
}

export function playlistCardKey(entries: PlaylistEntry[], position: number): string {
  const entry = entries[position];
  if (!entry) return `missing:${position}`;
  const occurrence = entries
    .slice(0, position + 1)
    .filter((candidate) => candidate.filename === entry.filename).length;
  return occurrence > 1 ? `${entry.filename}#${occurrence}` : entry.filename;
}

export function cardMetaText(art: CardArt | null): string {
  const duration = art?.duration ?? 0;
  const size = art?.size ?? 0;
  if (duration > 0 && size > 0) return `${formatClock(duration)} / ${formatBytes(size)}`;
  if (size > 0) return formatBytes(size);
  return "";
}

export function cardClass(current: boolean, focused: boolean, isOver: boolean): string {
  return cn(
    "windows95-border relative mb-1 flex flex-col gap-1 p-1",
    current ? "windows95-active-border bg-secondary text-primary" : "bg-field hover:bg-surface",
    focused && "outline-secondary outline-2",
    isOver && "outline-highlight outline-2"
  );
}
