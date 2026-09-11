import type { Event } from "@tauri-apps/api/event";

import type { TFunc, TranslationKey } from "@/types/i18n";
import type {
  TorrentDisplayState,
  TorrentLifecycle,
  TorrentInfo,
} from "@/types/torrent";

export const STALL_AFTER_MS = 30_000;

export function getDisplayState(
  item: TorrentInfo,
  lastActiveAt: Record<number, number>,
  now: number
): TorrentDisplayState {
  if (item.error) return "error";
  if (item.finished) return item.state === "live" ? "seeding" : "done";
  if (item.state === "paused") return "paused";
  if (item.download_speed > 0) return "downloading";
  const last = (lastActiveAt[item.id] ?? 0) * 1000;
  return now - last >= STALL_AFTER_MS ? "stalled" : "downloading";
}

export const DISPLAY_BAR_CLASS: Record<TorrentDisplayState, string> = {
  downloading: "bg-torrent-downloading",
  seeding: "bg-torrent-seeding",
  done: "bg-torrent-done",
  error: "bg-torrent-error",
  stalled: "bg-torrent-idle",
  paused: "bg-torrent-idle",
};

const DISPLAY_LABEL_KEY: Record<TorrentDisplayState, TranslationKey> = {
  downloading: "torrent.state.live",
  seeding: "torrent.lifecycle.seeding",
  done: "torrent.state.completed",
  error: "torrent.state.error",
  stalled: "torrent.state.stalled",
  paused: "torrent.state.paused",
};

export function displayStateLabel(state: TorrentDisplayState, t: TFunc): string {
  return t(DISPLAY_LABEL_KEY[state]);
}

export function findNewErrors(prev: TorrentInfo[], next: TorrentInfo[]): TorrentInfo[] {
  const prevError = new Set(prev.filter((t) => t.error).map((t) => t.id));
  return next.filter((t) => t.error && !prevError.has(t.id));
}
export function findJustFinished(
  prev: TorrentInfo[],
  next: TorrentInfo[],
  seedPreferences: Record<number, boolean>
): TorrentInfo[] {
  const prevById = new Map(prev.map((t) => [t.id, t]));
  return next.filter((t) => {
    if (!t.finished || t.state !== "live" || seedPreferences[t.id]) return false;
    const was = prevById.get(t.id);
    return was === undefined || !was.finished;
  });
}

export function fmtSpeed(bps: number): string {
  if (!bps || bps <= 0 || !isFinite(bps)) return "";

  if (bps < 1024) return `${bps.toFixed(0)} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}

export function isCurrentDownload(torrent: TorrentInfo): boolean {
  return !torrent.finished && torrent.state !== "paused" && torrent.state !== "error";
}

export function getTorrentLifecycle(state: string, finished: boolean): TorrentLifecycle {
  const stateMap: Record<typeof state, TorrentLifecycle> = {
    initializing: "staging",
    live: finished ? "seeding" : "live",
    paused: finished ? "completed" : "paused",
  };

  return stateMap[state] ?? "live";
}

const LIFECYCLE_LABEL_KEY: Record<TorrentLifecycle, TranslationKey> = {
  completed: "torrent.lifecycle.completed",
  live: "torrent.lifecycle.live",
  paused: "torrent.lifecycle.paused",
  seeding: "torrent.lifecycle.seeding",
  staging: "torrent.lifecycle.staging",
};

const STATE_LABEL_KEY: Record<string, TranslationKey> = {
  error: "torrent.state.error",
  initializing: "torrent.state.initializing",
  live: "torrent.state.live",
  paused: "torrent.state.paused",
};

export function getLifecycleLabel(lifecycle: TorrentLifecycle, t: TFunc): string {
  return t(LIFECYCLE_LABEL_KEY[lifecycle]);
}

export function stateLabel(state: string, t: TFunc): string {
  const key: TranslationKey | undefined = STATE_LABEL_KEY[state];
  return key === undefined ? state : t(key);
}

export interface TorrentListState {
  torrents: TorrentInfo[];
  lastActiveAt: Record<number, number>;
}

export function TorrentListen(
  state: TorrentListState,
  event: Event<TorrentInfo[]>,
  now: number = Date.now()
): Partial<TorrentListState> {
  const next = event.payload;
  const prev = state.torrents;
  const tick = Math.floor(now / 1000);
  const stamps: Record<number, number> = { ...state.lastActiveAt };
  let stampsChanged = false;
  const prevById = new Map(prev.map((t) => [t.id, t]));
  for (const t of next) {
    const p = prevById.get(t.id);
    const activeNow =
      t.download_speed > 0 || (p !== undefined && t.progress_bytes !== p.progress_bytes);
    if ((p === undefined || activeNow) && stamps[t.id] !== tick) {
      stamps[t.id] = tick;
      stampsChanged = true;
    }
  }
  for (const id of Object.keys(stamps)) {
    if (!next.some((t) => t.id === Number(id))) {
      delete stamps[Number(id)];
      stampsChanged = true;
    }
  }

  let changed = next.length !== prev.length || next.some((t, i) => prev[i]?.id !== t.id);
  if (!changed) {
    changed = next.some((t) => {
      const p = prevById.get(t.id);
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
  }

  if (stampsChanged)
    return changed ? { torrents: next, lastActiveAt: stamps } : { lastActiveAt: stamps };
  return changed ? { torrents: next } : {};
}

const GONE_ERRORS = ["torrent not found", "Torrent not found", "no such torrent in db"];

const KNOWN_TORRENT_ERRORS: { match: (raw: string) => boolean; key: TranslationKey }[] = [
  {
    match: (raw) => GONE_ERRORS.some((known) => raw.startsWith(known)),
    key: "download.error.gone",
  },
  {
    match: (raw) => raw.startsWith("torrent with id ") && raw.includes("did not exist"),
    key: "download.error.gone",
  },
  { match: (raw) => raw === "torrent is already paused", key: "download.error.already.paused" },
  { match: (raw) => raw === "torrent is already live", key: "download.error.already.live" },
  {
    match: (raw) => raw === "torrent is initializing, can't pause",
    key: "download.error.initializing",
  },
  {
    match: (raw) => raw === "can't pause torrent in error state",
    key: "download.error.state",
  },
  {
    match: (raw) => raw === "torrent list is stale, refresh and retry",
    key: "download.error.stale",
  },
  {
    match: (raw) => raw.startsWith("torrent reconfigure failed and the torrent is gone:"),
    key: "download.error.restore",
  },
];

export function torrentErrorText(raw: string, t: TFunc): string {
  if (raw.startsWith("torrent deleted, but could not delete files:")) {
    return `${t("download.error.files.kept")} ${raw}`;
  }
  const known = KNOWN_TORRENT_ERRORS.find((entry) => entry.match(raw));
  if (known === undefined) return raw;
  return t(known.key);
}
