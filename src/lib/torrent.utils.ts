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

export type TorrentLifecycle = "staging" | "live" | "seeding" | "completed";

export function getTorrentLifecycle(state: string, finished: boolean): TorrentLifecycle {
  if (state === "initializing") return "staging";
  if (state === "live" && finished) return "seeding";
  if (state === "live" && !finished) return "live";
  if (state === "paused" && finished) return "completed";
  if (state === "paused" && !finished) return "live";
  return "live";
}

export function getLifecycleLabel(lifecycle: TorrentLifecycle): string {
  switch (lifecycle) {
    case "staging": return "Подготовка";
    case "live": return "Загружается";
    case "seeding": return "Раздаётся";
    case "completed": return "Завершено";
  }
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

  function sortTree(node: TorrentTreeNode) {
    node.files.sort((a, b) => a.displayName.localeCompare(b.displayName));
    node.children.sort((a, b) => a.name.localeCompare(b.name));
    for (const child of node.children) sortTree(child);
  }
  for (const child of root.children) sortTree(child);

  return {
    nodes: root.children.sort((a, b) => a.name.localeCompare(b.name)),
    rootFiles: root.files.sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    ),
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

  const changed = next.some((t, i) => {
    const p = prev[i];
    if (!p) return true;
    return (
      p.progress_bytes !== t.progress_bytes ||
      p.state !== t.state ||
      p.download_speed !== t.download_speed ||
      p.upload_speed !== t.upload_speed ||
      p.peers_connected !== t.peers_connected ||
      p.finished !== t.finished ||
      p.error !== t.error ||
      p.uploaded_bytes !== t.uploaded_bytes ||
      p.total_bytes !== t.total_bytes ||
      p.sequential_download !== t.sequential_download ||
      p.eta_secs !== t.eta_secs ||
      p.name !== t.name ||
      p.save_dir !== t.save_dir
    );
  });

  return changed ? { torrents: next } : {};
}
