import type { Event } from "@tauri-apps/api/event";

import type { TranslationKey } from "@/lib/i18n";
import type { TranslationVariables } from "@/types";
import type {
  TorrentFileInfo,
  TorrentInfo,
  TorrentStore,
  FilePriority,
} from "@/types/torrent";

type TFunc = (key: TranslationKey, variables?: TranslationVariables) => string;

export function fmtSpeed(bps: number): string {
  if (bps <= 0) return "";
  if (bps < 1024) return `${bps.toFixed(0)} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}

export function fmtETA(secs: number | null, t: TFunc): string {
  if (!secs || secs <= 0 || !isFinite(secs)) return "";
  if (secs < 60) return t("torrent.eta.seconds", { s: Math.round(secs) });
  if (secs < 3600)
    return t("torrent.eta.minutesSeconds", {
      m: Math.floor(secs / 60),
      s: Math.round(secs % 60),
    });
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return t("torrent.eta.hoursMinutes", { h, m });
}

export function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function fmtElapsed(sec: number, t: TFunc): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return t("torrent.eta.seconds", { s });
  if (s === 0) return t("torrent.eta.minutes", { m });
  return t("torrent.eta.minutesSeconds", { m, s });
}

export type TorrentLifecycle =
  | "staging"
  | "live"
  | "paused"
  | "seeding"
  | "completed";

export function getTorrentLifecycle(
  state: string,
  finished: boolean
): TorrentLifecycle {
  if (state === "initializing") return "staging";
  if (state === "live" && finished) return "seeding";
  if (state === "live" && !finished) return "live";
  if (state === "paused" && finished) return "completed";
  if (state === "paused" && !finished) return "paused";
  return "live";
}

export function getLifecycleLabel(
  lifecycle: TorrentLifecycle,
  t: TFunc
): string {
  switch (lifecycle) {
    case "staging": {
      return t("torrent.lifecycle.staging");
    }
    case "live": {
      return t("torrent.lifecycle.live");
    }
    case "paused": {
      return t("torrent.lifecycle.paused");
    }
    case "seeding": {
      return t("torrent.lifecycle.seeding");
    }
    case "completed": {
      return t("torrent.lifecycle.completed");
    }
  }
}

export function stateLabel(state: string, t: TFunc): string {
  switch (state) {
    case "live": {
      return t("torrent.state.live");
    }
    case "paused": {
      return t("torrent.state.paused");
    }
    case "initializing": {
      return t("torrent.state.initializing");
    }
    case "error": {
      return t("torrent.state.error");
    }
    default: {
      return state;
    }
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
    priority?: FilePriority;
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
  progress_bytes: number;
  completed: boolean;
  selected: boolean;
  priority: FilePriority;
  exists: boolean;
}

export function buildTorrentTree(files: TorrentFileInfo[]): {
  nodes: TorrentTreeNode[];
  rootFiles: TorrentTreeFile[];
} {
  const root: TorrentTreeNode = { children: [], files: [], name: "" };

  for (const file of files) {
    const parts = file.name.replaceAll(/\\/g, "/").split("/");
    const fileName = parts.pop()!;

    let node = root;

    for (const part of parts) {
      let child = node.children.find((c) => c.name === part);

      if (!child) {
        child = { children: [], files: [], name: part };
        node.children.push(child);
      }
      node = child;
    }

    node.files.push({
      completed: file.completed,
      displayName: fileName,
      exists: file.exists,
      index: file.index,
      name: file.name,
      priority: file.priority,
      progress_bytes: file.progress_bytes,
      selected: file.selected,
      size: file.size,
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
      a.displayName.localeCompare(b.displayName)
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
    priority?: FilePriority;
    exists?: boolean;
  }[]
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

  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (a === "") return -1;
      if (b === "") return 1;
      return a.localeCompare(b);
    })
    .map(([, group]) => ({
      ...group,
      files: group.files.sort((a, b) =>
        a.displayName.localeCompare(b.displayName)
      ),
    }));
}

export function TorrentListen(
  state: TorrentStore,
  event: Event<TorrentInfo[]>
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
      p.share_ratio !== t.share_ratio ||
      p.total_bytes !== t.total_bytes ||
      p.sequential_download !== t.sequential_download ||
      p.eta_secs !== t.eta_secs ||
      p.name !== t.name ||
      p.save_dir !== t.save_dir
    );
  });

  return changed ? { torrents: next } : {};
}
