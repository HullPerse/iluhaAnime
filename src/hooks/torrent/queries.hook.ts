import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import type { Event } from "@tauri-apps/api/event";
import { useEffect, useMemo } from "react";

import { torrentApi } from "@/api/torrent.api";
import {
  TorrentListen,
  TORRENT_WATCHDOG_MS,
  findJustFinished,
  findNewErrors,
  shouldHealTorrentChannel,
  torrentErrorText,
} from "@/lib/torrent/common.utils";
import { attempt, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { showError, showInfo, showWarning } from "@/lib/utils/notification.utils";
import { useCacheStore } from "@/store/cache.store";
import { tr, useTorrentStore } from "@/store/download.store";
import type {
  FilePriority,
  TorrentCheckResult,
  TorrentFileInfo,
  TorrentInfo,
} from "@/types/torrent";

export const TORRENTS_QUERY_KEY = ["torrents"] as const;
export const torrentFilesKey = (id: number) => ["torrent-files", id] as const;
export const TORRENT_LISTEN_PORT_KEY = ["torrent-listen-port"] as const;

let initialErrorNotified = false;
let primedSeedPause = false;
let subscriptionOwners = 0;
let sharedUnlisten: (() => void) | undefined;
let listenPending = false;
let lastTorrentEventAt = 0;
let lastTorrentHealAt = 0;
let torrentWatchStartedAt = 0;

function applyTorrentEvent(queryClient: QueryClient, event: Event<TorrentInfo[]>): void {
  lastTorrentEventAt = Date.now();
  const store = useTorrentStore.getState();
  const prev = queryClient.getQueryData<TorrentInfo[]>(TORRENTS_QUERY_KEY) ?? [];
  const patch = TorrentListen({ torrents: prev, lastActiveAt: store.lastActiveAt }, event);
  if (patch.torrents !== undefined) queryClient.setQueryData(TORRENTS_QUERY_KEY, patch.torrents);
  if (patch.lastActiveAt !== undefined)
    useTorrentStore.setState({ lastActiveAt: patch.lastActiveAt });
  for (const t of findNewErrors(prev, event.payload)) {
    showError(tr("torrent.state.error"), `${t.name}: ${t.error}`);
  }
  const prefs = useCacheStore.getState().seedPreferences;
  for (const t of findJustFinished(prev, event.payload, prefs)) {
    torrentApi
      .pauseTorrent(t.id)
      .catch((error) => reportBackgroundError("torrent.autopause.push", error));
  }
}

function startTorrentSubscription(queryClient: QueryClient): void {
  if (sharedUnlisten || listenPending) return;
  listenPending = true;
  (async () => {
    const [unlisten, error] = await attempt(
      listen<TorrentInfo[]>("torrents-update", (event) => {
        if (subscriptionOwners > 0) applyTorrentEvent(queryClient, event);
      })
    );
    listenPending = false;
    if (error || !unlisten) return;
    if (subscriptionOwners <= 0) unlisten();
    else sharedUnlisten = unlisten;
  })();
}

function ensureTorrentSubscription(queryClient: QueryClient): () => void {
  subscriptionOwners += 1;
  if (torrentWatchStartedAt === 0) torrentWatchStartedAt = Date.now();
  startTorrentSubscription(queryClient);
  return () => {
    subscriptionOwners -= 1;
    if (subscriptionOwners <= 0) {
      subscriptionOwners = 0;
      sharedUnlisten?.();
      sharedUnlisten = undefined;
    }
  };
}

export function useTorrents(enabled = true) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: TORRENTS_QUERY_KEY,
    queryFn: () => torrentApi.listTorrents().then((list) => list ?? []),
    enabled,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
  useEffect(() => {
    if (enabled && query.error && !initialErrorNotified) {
      initialErrorNotified = true;
      const message = query.error instanceof Error ? query.error.message : String(query.error);
      showError(tr("app.torrent"), message);
    }
  }, [enabled, query.error]);
  useEffect(() => {
    if (!enabled || !query.data || primedSeedPause) return;
    primedSeedPause = true;
    const prefs = useCacheStore.getState().seedPreferences;
    for (const t of findJustFinished([], query.data, prefs)) {
      torrentApi
        .pauseTorrent(t.id)
        .catch((error) => reportBackgroundError("torrent.autopause.prime", error));
    }
  }, [enabled, query.data]);
  useEffect(() => {
    if (!enabled) return;
    return ensureTorrentSubscription(queryClient);
  }, [enabled, queryClient]);
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      if (subscriptionOwners > 0) startTorrentSubscription(queryClient);
      if (document.hidden) return;
      const now = Date.now();
      const heal = shouldHealTorrentChannel(
        {
          lastEventAt: lastTorrentEventAt,
          watchStartedAt: torrentWatchStartedAt,
          lastHealAt: lastTorrentHealAt,
        },
        now
      );
      if (!heal) return;
      lastTorrentHealAt = now;
      queryClient.invalidateQueries({ queryKey: TORRENTS_QUERY_KEY });
    }, TORRENT_WATCHDOG_MS);
    return () => window.clearInterval(timer);
  }, [enabled, queryClient]);
  return query;
}

function sameFileInfo(prev: TorrentFileInfo, next: TorrentFileInfo): boolean {
  return (
    prev.index === next.index &&
    prev.completed === next.completed &&
    prev.selected === next.selected &&
    prev.exists === next.exists &&
    prev.progress_bytes === next.progress_bytes &&
    prev.priority === next.priority
  );
}

export function useTorrentListenPort(enabled = true) {
  return useQuery({
    queryKey: TORRENT_LISTEN_PORT_KEY,
    queryFn: () => torrentApi.listenPort(),
    enabled,
    staleTime: 5000,
    retry: false,
  });
}

async function fetchTorrentFiles(queryClient: QueryClient, id: number): Promise<TorrentFileInfo[]> {
  const [files, error] = await attempt(torrentApi.runningTorrentFiles(id));
  if (error) throw error;
  const next = files ?? [];
  const prev = queryClient.getQueryData<TorrentFileInfo[]>(torrentFilesKey(id));
  if (
    prev &&
    prev.length === next.length &&
    prev.every((file, index) => sameFileInfo(file, next[index]))
  )
    return prev;
  return next;
}

export function useTorrentFiles(
  id: number | null,
  options?: { enabled?: boolean; refetchMs?: number | false }
) {
  const queryClient = useQueryClient();
  const enabled = (options?.enabled ?? true) && id !== null;
  return useQuery({
    queryKey: torrentFilesKey(id ?? 0),
    queryFn: () => fetchTorrentFiles(queryClient, id ?? 0),
    enabled,
    staleTime: 2000,
    refetchInterval: options?.refetchMs ?? false,
    retry: false,
  });
}

export function useTorrentFilesMap(
  ids: number[],
  refetchMs: number | false = false
): {
  files: Record<number, TorrentFileInfo[] | undefined>;
  pendingIds: Set<number>;
  errors: Record<number, string>;
} {
  const queryClient = useQueryClient();
  const queriesInput = useMemo(
    () =>
      ids.map((id) => ({
        queryKey: torrentFilesKey(id),
        queryFn: () => fetchTorrentFiles(queryClient, id),
        staleTime: 2000,
        refetchInterval: refetchMs,
        retry: false,
      })),
    [ids, queryClient, refetchMs]
  );
  const results = useQueries({ queries: queriesInput });
  return useMemo(() => {
    const files: Record<number, TorrentFileInfo[] | undefined> = {};
    const pendingIds = new Set<number>();
    const errors: Record<number, string> = {};
    ids.forEach((id, index) => {
      files[id] = results[index]?.data;
      if (results[index]?.isFetching) pendingIds.add(id);
      const failure = results[index]?.error;
      if (failure !== undefined && failure !== null)
        errors[id] = failure instanceof Error ? failure.message : String(failure);
    });
    return { files, pendingIds, errors };
  }, [ids, results]);
}

function setOpInFlight(id: number, op: "pause" | "resume" | "remove" | null): void {
  useTorrentStore.setState((state) => {
    if (op === null) {
      if (state.opInFlight[id] === undefined) return state;
      const next = { ...state.opInFlight };
      delete next[id];
      return { opInFlight: next };
    }
    return { opInFlight: { ...state.opInFlight, [id]: op } };
  });
}

export function usePauseTorrent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: number; infoHash?: string }) => {
      const { id } = vars;
      if (useTorrentStore.getState().opInFlight[id] !== undefined) return;
      const prev = queryClient.getQueryData<TorrentInfo[]>(TORRENTS_QUERY_KEY);
      queryClient.setQueryData<TorrentInfo[]>(TORRENTS_QUERY_KEY, (old) =>
        (old ?? []).map((t) => (t.id === id ? { ...t, state: "paused" } : t))
      );
      setOpInFlight(id, "pause");
      const [, error] = await attempt(torrentApi.pauseTorrent(id, vars.infoHash));
      setOpInFlight(id, null);
      if (error) {
        showError(tr("download.error.pause"), torrentErrorText(error.message, tr));
        if (prev !== undefined) queryClient.setQueryData(TORRENTS_QUERY_KEY, prev);
      } else {
        queryClient.invalidateQueries({ queryKey: TORRENTS_QUERY_KEY });
      }
    },
  });
}

export function useResumeTorrent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: number; infoHash?: string }) => {
      const { id } = vars;
      if (useTorrentStore.getState().opInFlight[id] !== undefined) return;
      const prev = queryClient.getQueryData<TorrentInfo[]>(TORRENTS_QUERY_KEY);
      queryClient.setQueryData<TorrentInfo[]>(TORRENTS_QUERY_KEY, (old) =>
        (old ?? []).map((t) => (t.id === id ? { ...t, state: "live" } : t))
      );
      setOpInFlight(id, "resume");
      const [result, error] = await attempt(torrentApi.resumeTorrent(id, vars.infoHash));
      setOpInFlight(id, null);
      if (error) {
        showError(tr("download.error.resume"), torrentErrorText(error.message, tr));
        if (prev !== undefined) queryClient.setQueryData(TORRENTS_QUERY_KEY, prev);
        return;
      }
      queryClient.invalidateQueries({ queryKey: TORRENTS_QUERY_KEY });
      if (!result) return;
      queryClient.invalidateQueries({ queryKey: torrentFilesKey(result.id) });
      if (result.rechecked) notifyResumeReverified(result.check);
    },
  });
}

function notifyResumeReverified(check: TorrentCheckResult | null): void {
  const title = tr("torrent.resume.external.title");
  if (!check) {
    showInfo(title);
    return;
  }
  const parts = [tr("torrent.resume.external.body", { ok: check.ok, total: check.total })];
  if (check.missing.length > 0) {
    parts.push(tr("torrent.recheck.missing", { count: check.missing.length }));
  }
  if (check.size_mismatch.length > 0) {
    parts.push(tr("torrent.recheck.size", { count: check.size_mismatch.length }));
  }
  const body = parts.join(" · ");
  if (check.missing.length > 0 || check.size_mismatch.length > 0) {
    showWarning(title, body);
  } else {
    showInfo(title, body);
  }
}

export function useRemoveTorrent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: number; deleteFiles: boolean; infoHash?: string }) => {
      const { id } = vars;
      if (!Number.isInteger(id)) return false;
      setOpInFlight(id, "remove");
      const [, error] = await attempt(
        torrentApi.removeTorrent(id, vars.deleteFiles, vars.infoHash)
      );
      setOpInFlight(id, null);
      if (error) {
        showError(tr("download.error.remove"), torrentErrorText(error.message, tr));
        return false;
      }
      useCacheStore.getState().removeSeedPreference(id);
      queryClient.setQueryData<TorrentInfo[]>(TORRENTS_QUERY_KEY, (old) =>
        (old ?? []).filter((t) => t.id !== id)
      );
      queryClient.removeQueries({ queryKey: torrentFilesKey(id) });
      useTorrentStore.setState((state) => {
        const lastActiveAt = { ...state.lastActiveAt };
        delete lastActiveAt[id];
        return { lastActiveAt };
      });
      return true;
    },
  });
}

export function useUpdateOnlyFiles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: number; indices: number[]; infoHash?: string }) => {
      const [, error] = await attempt(
        torrentApi.updateOnlyFiles(vars.id, vars.indices, vars.infoHash)
      );
      if (error) {
        showError(tr("download.error.update"), torrentErrorText(error.message, tr));
        return;
      }
      queryClient.invalidateQueries({ queryKey: torrentFilesKey(vars.id) });
    },
  });
}

export function useSetFilePriority() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      id: number;
      fileIndices: number[];
      priority: FilePriority;
      infoHash?: string;
    }) => {
      const [, error] = await attempt(
        torrentApi.setFilePriority(vars.id, vars.fileIndices, vars.priority, vars.infoHash)
      );
      if (error) {
        showError(tr("download.error.priority"), torrentErrorText(error.message, tr));
        return;
      }
      queryClient.invalidateQueries({ queryKey: torrentFilesKey(vars.id) });
    },
  });
}

export function useSetSequentialDownload() {
  return useMutation({
    mutationFn: async (vars: { id: number; enabled: boolean; infoHash?: string }) => {
      const [, error] = await attempt(
        torrentApi.setSequentialDownload(vars.id, vars.enabled, vars.infoHash)
      );
      if (error) showError(tr("download.error.sequential"), torrentErrorText(error.message, tr));
    },
  });
}

export function useSetDownloadOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: number; indices: number[]; infoHash?: string }) => {
      const [, error] = await attempt(
        torrentApi.setTorrentDownloadOrder(vars.id, vars.indices, vars.infoHash)
      );
      if (error) {
        showError(tr("download.error.order"), torrentErrorText(error.message, tr));
        return;
      }
      queryClient.invalidateQueries({ queryKey: torrentFilesKey(vars.id) });
    },
  });
}

export function useRedownloadFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: number; fileIndex: number; infoHash: string }) => {
      const [newId, error] = await attempt(
        torrentApi.redownloadFile(vars.id, vars.fileIndex, vars.infoHash)
      );
      if (error) {
        showError(tr("download.error.redownload"), torrentErrorText(error.message, tr));
        return null;
      }
      if (newId !== null) queryClient.invalidateQueries({ queryKey: torrentFilesKey(newId) });
      return newId;
    },
  });
}

export function useRecheckTorrent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: number; infoHash?: string }) => {
      const [result, error] = await attempt(torrentApi.recheckTorrent(vars.id, vars.infoHash));
      if (error) {
        showError(tr("download.error.recheck"), torrentErrorText(error.message, tr));
        return null;
      }
      queryClient.invalidateQueries({ queryKey: torrentFilesKey(vars.id) });
      return result;
    },
  });
}

export function useRecheckPausedTorrent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: number; infoHash?: string }) => {
      const [result, error] = await attempt(
        torrentApi.recheckPausedTorrent(vars.id, vars.infoHash)
      );
      if (error) {
        showError(tr("download.error.recheck"), torrentErrorText(error.message, tr));
        return null;
      }
      queryClient.invalidateQueries({ queryKey: TORRENTS_QUERY_KEY });
      if (result) queryClient.invalidateQueries({ queryKey: torrentFilesKey(result.id) });
      return result;
    },
  });
}

export function useAddTorrentTracker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: number; tracker: string; infoHash: string }) => {
      const [, error] = await attempt(
        torrentApi.addTorrentTracker(vars.id, vars.tracker, vars.infoHash)
      );
      if (error) {
        showError(tr("download.error.tracker.add"), torrentErrorText(error.message, tr));
        return false;
      }
      queryClient.invalidateQueries({ queryKey: ["torrent_diagnostics", vars.id] });
      queryClient.invalidateQueries({ queryKey: TORRENTS_QUERY_KEY });
      return true;
    },
  });
}

export function useRemoveTorrentTracker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: number; tracker: string; infoHash: string }) => {
      const [, error] = await attempt(
        torrentApi.removeTorrentTracker(vars.id, vars.tracker, vars.infoHash)
      );
      if (error) {
        showError(tr("download.error.tracker.remove"), torrentErrorText(error.message, tr));
        return false;
      }
      queryClient.invalidateQueries({ queryKey: ["torrent_diagnostics", vars.id] });
      queryClient.invalidateQueries({ queryKey: TORRENTS_QUERY_KEY });
      return true;
    },
  });
}
