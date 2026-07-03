import { TorrentFileInfo, TorrentInfo, TorrentStore } from "@/types/torrent";
import { type Event } from "@tauri-apps/api/event";

export function fmtSpeed(bps: number): string {
  if (bps <= 0) return "";
  if (bps < 1024) return `${bps.toFixed(0)} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}

export function fmtETA(secs: number | null): string {
  if (!secs || secs <= 0 || !isFinite(secs)) return "";
  if (secs < 60) return `${Math.round(secs)} сек`;
  if (secs < 3600)
    return `${Math.floor(secs / 60)} мин ${Math.round(secs % 60)} сек`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h} ч ${m} мин`;
}

export function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function fmtElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s} сек`;
  if (s === 0) return `${m} мин`;
  return `${m} мин ${s} сек`;
}

export function stateLabel(state: string): string {
  switch (state) {
    case "live":
      return "Загружается";
    case "paused":
      return "Пауза";
    case "initializing":
      return "Инициализация";
    case "error":
      return "Ошибка";
    default:
      return state;
  }
}

export interface FileGroup {
  dir: string;
  files: {
    index: number;
    name: string;
    displayName: string;
    size: number;
    completed?: boolean;
    selected?: boolean;
    priority?: string;
    exists?: boolean;
  }[];
}

export interface TorrentTreeNode {
  name: string;
  files: TorrentTreeFile[];
  children: TorrentTreeNode[];
}

export interface TorrentTreeFile {
  index: number;
  name: string;
  displayName: string;
  size: number;
  completed: boolean;
  selected: boolean;
  priority: string;
  exists: boolean;
}

export function buildTorrentTree(files: TorrentFileInfo[]): {
  nodes: TorrentTreeNode[];
  rootFiles: TorrentTreeFile[];
} {
  const root: TorrentTreeNode = { name: "", files: [], children: [] };

  for (const file of files) {
    const parts = file.name.replace(/\\/g, "/").split("/");
    const fileName = parts.pop()!;

    let node = root;

    for (const part of parts) {
      let child = node.children.find((c) => c.name === part);

      if (!child) {
        child = { name: part, files: [], children: [] };
        node.children.push(child);
      }
      node = child;
    }

    node.files.push({
      index: file.index,
      name: file.name,
      displayName: fileName,
      size: file.size,
      completed: file.completed,
      selected: file.selected,
      priority: file.priority,
      exists: file.exists,
    });
  }

  return {
    nodes: root.children.sort((a, b) => a.name.localeCompare(b.name)),
    rootFiles: root.files,
  };
}

export function groupFilesByDirectory(
  files: {
    name: string;
    index: number;
    size: number;
    completed?: boolean;
    selected?: boolean;
    priority?: string;
    exists?: boolean;
  }[],
): FileGroup[] {
  const groups = new Map<string, FileGroup>();

  for (const file of files) {
    const idx = file.name.search(/[/\\]/);
    if (idx === -1) {
      const dir = "";
      if (!groups.has(dir)) groups.set(dir, { dir, files: [] });
      groups.get(dir)!.files.push({ ...file, displayName: file.name });
    } else {
      const dir = file.name.slice(0, idx);
      const displayName = file.name.slice(idx + 1);
      if (!groups.has(dir)) groups.set(dir, { dir, files: [] });
      groups.get(dir)!.files.push({ ...file, displayName });
    }
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => {
      if (a === "") return -1;
      if (b === "") return 1;
      return a.localeCompare(b);
    })
    .map(([_, group]) => ({
      ...group,
      files: group.files.sort((a, b) =>
        a.displayName.localeCompare(b.displayName),
      ),
    }));
}

export function TorrentListen(
  state: TorrentStore,
  event: Event<TorrentInfo[]>,
) {
  const next = event.payload;
  const prev = state.torrents;

  if (prev.length !== next.length) return { torrents: next };

  for (let i = 0; i < prev.length; i++) {
    if (
      prev[i].progress_bytes !== next[i]?.progress_bytes ||
      prev[i].state !== next[i]?.state ||
      prev[i].download_speed !== next[i]?.download_speed ||
      prev[i].upload_speed !== next[i]?.upload_speed ||
      prev[i].peers_connected !== next[i]?.peers_connected ||
      prev[i].finished !== next[i]?.finished
    ) {
      return { torrents: next };
    }
  }
  return {};
}
