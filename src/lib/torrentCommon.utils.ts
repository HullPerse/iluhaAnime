import type { Event } from "@tauri-apps/api/event";

import { formatRate } from "@/lib/bytes.utils";
import type { TFunc, TranslationKey } from "@/types/i18n";
import type { TorrentDisplayState, TorrentLifecycle, TorrentInfo } from "@/types/torrent";

export function sameDownloadOrder(prev: number[] | undefined, next: number[] | undefined): boolean {
  if (prev === next) return true;
  if (!prev || !next) return false;
  return prev.length === next.length && prev.every((index, i) => index === next[i]);
}

export function sameExternalChangedFiles(
  prev: string[] | undefined,
  next: string[] | undefined
): boolean {
  if (prev === next) return true;
  if (!prev || !next) return false;
  return prev.length === next.length && prev.every((name, i) => name === next[i]);
}

/**
 * Everything on a torrent row except the two arrays, which are rebuilt on
 * every event and compared field by field.
 */
const TORRENT_FIELDS = [
  "id",
  "name",
  "info_hash",
  "total_bytes",
  "progress_bytes",
  "uploaded_bytes",
  "share_ratio",
  "download_speed",
  "upload_speed",
  "peers_connected",
  "progress",
  "state",
  "eta_secs",
  "finished",
  "error",
  "save_dir",
  "sequential_download",
  "sequential_file",
  "missing_files",
  "external_changes",
  "checking_file",
  "disk_sparse",
] as const satisfies readonly (keyof TorrentInfo)[];

export function sameTorrentFields(prev: TorrentInfo, next: TorrentInfo): boolean {
  return TORRENT_FIELDS.every((field) => prev[field] === next[field]);
}

export const STALL_AFTER_MS = 30_000;
export const TORRENT_EVENT_STALE_MS = 35_000;
export const TORRENT_WATCHDOG_MS = 5_000;

export function shouldHealTorrentPoll(lastEventAtMs: number, nowMs: number): boolean {
  if (lastEventAtMs <= 0) return false;
  return nowMs - lastEventAtMs >= TORRENT_EVENT_STALE_MS;
}

export function shouldHealTorrentChannel(
  state: { lastEventAt: number; watchStartedAt: number; lastHealAt: number },
  nowMs: number
): boolean {
  const lastContact = Math.max(state.lastEventAt, state.watchStartedAt, state.lastHealAt);
  if (lastContact <= 0) return false;
  return shouldHealTorrentPoll(lastContact, nowMs);
}

/** The engine knows the torrent and is hashing the files it already has. */
export function isCheckingFiles(item: TorrentInfo): boolean {
  return item.state === "initializing" && item.total_bytes > 0;
}

export function getDisplayState(
  item: TorrentInfo,
  lastActiveAt: Record<number, number>,
  now: number
): TorrentDisplayState {
  if (item.missing_files) return "missing";
  if (item.error) return "error";
  if (item.finished) return item.state === "live" ? "seeding" : "done";
  if (item.state === "paused") return "paused";
  if (item.total_bytes === 0) return "initializing";
  if (isCheckingFiles(item)) return "checking";
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
  initializing: "bg-torrent-initializing",
  checking: "bg-torrent-initializing",
  missing: "bg-torrent-missing",
};

const DISPLAY_LABEL_KEY: Record<TorrentDisplayState, TranslationKey> = {
  downloading: "torrent.state.live",
  seeding: "torrent.lifecycle.seeding",
  done: "torrent.state.completed",
  error: "torrent.state.error",
  stalled: "torrent.state.stalled",
  paused: "torrent.state.paused",
  initializing: "torrent.state.initializing",
  checking: "torrent.state.checking",
  missing: "torrent.state.missing",
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
  return formatRate(bps);
}

export function formatSpeed(bps: number): string {
  return fmtSpeed(bps) || "0 B/s";
}

export function isCurrentDownload(torrent: TorrentInfo): boolean {
  return !torrent.finished && torrent.state !== "paused" && torrent.state !== "error";
}

export function countLiveTorrents(torrents: readonly TorrentInfo[]): {
  active: number;
  seeding: number;
} {
  let active = 0;
  let seeding = 0;
  for (const item of torrents) {
    if (item.state !== "live") continue;
    if (item.finished) seeding += 1;
    else active += 1;
  }
  return { active, seeding };
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

export function withoutPendingRemoved(
  torrents: TorrentInfo[],
  pendingIds: ReadonlySet<number>
): TorrentInfo[] {
  if (pendingIds.size === 0) return torrents;
  return torrents.filter((t) => !pendingIds.has(t.id));
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
        !sameTorrentFields(p, t) ||
        !sameExternalChangedFiles(p.external_changed_files, t.external_changed_files) ||
        !sameDownloadOrder(p.download_order, t.download_order)
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
