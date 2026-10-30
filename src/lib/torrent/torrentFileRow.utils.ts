import { openPath } from "@tauri-apps/plugin-opener";
import type { MouseEvent } from "react";

import { formatBytes } from "@/lib/core/bytes.utils";
import { joinMediaPath } from "@/lib/player/media.utils";
import { fileNameFromPath, isTrackFileName } from "@/lib/search/parse.utils";
import type { FileRowInteractions, PlayerRowTarget } from "@/types/core/fileRows";
import type { TFunc } from "@/types/core/i18n";
import type { TorrentTreeFile } from "@/types/torrent/torrent";

export function onDiskTitle(file: TorrentTreeFile, t: TFunc): string | undefined {
  if (!file.selected || file.completed) return undefined;
  return t("torrent.files.on.disk", { size: formatBytes(file.on_disk_bytes ?? 0) });
}

export function resolvePlayerRowTarget(
  file: TorrentTreeFile,
  fullPath: string | undefined,
  saveDir: string | undefined,
  queueMap: Map<string, string>,
  trackExts: Set<string>
): PlayerRowTarget {
  const resolvedPath = fullPath ?? (saveDir ? joinMediaPath(saveDir, file.name) : undefined);
  const track = isTrackFileName(fileNameFromPath(resolvedPath ?? file.displayName), trackExts);
  const queueStatus = resolvedPath ? queueMap.get(resolvedPath) : undefined;
  return {
    resolvedPath,
    track,
    busy: queueStatus === "queued" || queueStatus === "processing",
  };
}

export function handlePlayerContextMenu(
  event: MouseEvent,
  args: {
    type: "torrent" | "player";
    track: boolean;
    busy: boolean;
    completed: boolean;
    exists: boolean;
    resolvedPath: string | undefined;
    saveDir: string | undefined;
    onOpenInApp?: (fullPath: string) => void;
  }
): void {
  event.preventDefault();
  if (args.type !== "player") return;
  if (event.ctrlKey || event.metaKey) {
    if (args.track || args.busy || !args.completed || !args.exists || !args.resolvedPath) return;
    args.onOpenInApp?.(args.resolvedPath);
    return;
  }
  openPath(String(args.saveDir));
}

export function resolveFileRowInteractions(args: {
  type: "torrent" | "player";
  track: boolean;
  busy: boolean;
  completed: boolean;
  exists: boolean;
  resolvedPath: string | undefined;
  saveDir: string | undefined;
  onOpenInApp: ((fullPath: string) => void) | undefined;
}): FileRowInteractions {
  const interactive = args.type === "player" && !args.track;
  return {
    interactive,
    contextMenu: interactive && Boolean(args.saveDir),
    ctrlClick:
      interactive &&
      !args.busy &&
      args.completed &&
      args.exists &&
      Boolean(args.resolvedPath) &&
      Boolean(args.onOpenInApp),
  };
}
