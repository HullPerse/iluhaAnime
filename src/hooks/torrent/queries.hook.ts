import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import type { Event } from "@tauri-apps/api/event";
import { useEffect, useMemo, useState } from "react";

import { torrentApi } from "@/api/torrent.api";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/query/keys.utils";
import {
  TorrentListen,
  TORRENT_WATCHDOG_MS,
  findJustFinished,
  findNewErrors,
  shouldHealTorrentChannel,
  torrentErrorText,
  withoutPendingRemoved,
} from "@/lib/torrent/common.utils";
import { attempt, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { showError, showInfo, showWarning } from "@/lib/utils/notification.utils";
import { ignore } from "@/lib/utils/promise.utils";
import { tr } from "@/lib/locale/i18n.utils";
import { cacheAtoms, removeSeedPreference } from "@/store/cache.store";
import { torrentAtoms } from "@/store/download.store";
import { addNotification, updateNotification } from "@/store/notification.store";
import type {
  FilePriority,
  TorrentCheckResult,
  TorrentFileInfo,
  TorrentInfo,
} from "@/types/torrent";

export const TORRENTS_QUERY_KEY = queryKeys.torrents();
export const torrentFilesKey = (id: number) => queryKeys.torrentFiles(id);
export const TORRENT_LISTEN_PORT_KEY = queryKeys.torrentListenPort();

let initialErrorNotified = false;
let primedSeedPause = false;
let subscriptionOwners = 0;
let sharedUnlisten: (() => void) | undefined;
let listenPending = false;
let lastTorrentEventAt = 0;
let lastTorrentHealAt = 0;
let torrentWatchStartedAt = 0;

function pendingRemoveIds(): Set<number> {
  const ids = new Set<number>();
  const opInFlight = torrentAtoms.opInFlight.get();
  for (const [key, op] of Object.entries(opInFlight)) {
    if (op === "remove") ids.add(Number(key));
  }
  return ids;
}

function applyTorrentEvent(queryClient: QueryClient, event: Event<TorrentInfo[]>): void {
  lastTorrentEventAt = Date.now();
  const lastActiveAt = torrentAtoms.lastActiveAt.get();
  const prev = queryClient.getQueryData<TorrentInfo[]>(TORRENTS_QUERY_KEY) ?? [];
  const payload = withoutPendingRemoved(event.payload, pendingRemoveIds());
  const patch = TorrentListen(
    { torrents: prev, lastActiveAt },
    {
      ...event,
      payload,
    }
  );
  if (patch.torrents !== undefined) queryClient.setQueryData(TORRENTS_QUERY_KEY, patch.torrents);
  if (patch.lastActiveAt !== undefined)
    torrentAtoms.lastActiveAt.set(patch.lastActiveAt);
  for (const t of findNewErrors(prev, payload)) {
    showError(tr("torrent.state.error"), `${t.name}: ${t.error}`);
  }
  const prefs = cacheAtoms.seedPreferences.get();
  for (const t of findJustFinished(prev, payload, prefs)) {
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
  const query = useAppQuery("realtime", {
    queryKey: queryKeys.torrents(),
    queryFn: () =>
      torrentApi
        .listTorrents()
        .then((list) => withoutPendingRemoved(list ?? [], pendingRemoveIds())),
    enabled,
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
    const prefs = cacheAtoms.seedPreferences.get();
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
  return useAppQuery("live", {
    queryKey: queryKeys.torrentListenPort(),
    queryFn: () => torrentApi.listenPort(),
    enabled,
    retry: false,
  });
}

export function useDhtStats() {
  return useAppQuery("slow", {
    queryKey: ["dht-stats"],
    queryFn: () => torrentApi.getDhtStats(),
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

export function useTorrentFilesMap(
  ids: number[],
  refetchMs: number | false = false,
  enabledIds?: Set<number>
): {
  files: Record<number, TorrentFileInfo[] | undefined>;
  pendingIds: Set<number>;
  errors: Record<number, string>;
} {
  const queryClient = useQueryClient();
  const queriesInput = useMemo(
    () =>
      ids.map((id) => {
        const enabled = enabledIds?.has(id) ?? true;
        return {
          queryKey: queryKeys.torrentFiles(id),
          queryFn: () => fetchTorrentFiles(queryClient, id),
          staleTime: 5000,
          enabled,
          retry: false,
        };
      }),
    [ids, queryClient, enabledIds]
  );
  const results = useQueries({ queries: queriesInput });

  const pollIds = useMemo(() => {
    if (refetchMs === false) return [];
    const wanted = (enabledIds ? ids.filter((id) => enabledIds.has(id)) : ids).map(String);
    return wanted.sort();
  }, [enabledIds, ids, refetchMs]);
  const [pollingIds, setPollingIds] = useState<Set<string>>(new Set());
  const [pollErrors, setPollErrors] = useState<Record<number, string>>({});

  useEffect(() => {
    if (refetchMs === false || pollIds.length === 0) return;
    let disposed = false;
    const sweep = async () => {
      const idsToFetch = pollIds.map(Number);
      setPollingIds(new Set(pollIds));
      const [entries] = await attempt(torrentApi.runningTorrentFilesBatch(idsToFetch));
      if (disposed) return;
      setPollingIds(new Set());
      setPollErrors((prev) => {
        const next: Record<number, string> = { ...prev };
        for (const entry of entries ?? []) {
          if (entry.error !== null) {
            next[entry.id] = entry.error;
            continue;
          }
          delete next[entry.id];
          const files = entry.files ?? [];
          const key = queryKeys.torrentFiles(entry.id);
          const cached = queryClient.getQueryData<TorrentFileInfo[]>(key);
          queryClient.setQueryData(
            key,
            cached &&
              cached.length === files.length &&
              cached.every((file, index) => sameFileInfo(file, files[index]!))
              ? cached
              : files
          );
        }
        return next;
      });
    };
    ignore(sweep());
    const timer = window.setInterval(() => ignore(sweep()), refetchMs);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [pollIds, queryClient, refetchMs]);

  return useMemo(() => {
    const files: Record<number, TorrentFileInfo[] | undefined> = {};
    const pendingIds = new Set<number>();
    const errors: Record<number, string> = {};
    ids.forEach((id, index) => {
      files[id] = results[index]?.data;
      if (results[index]?.isFetching || pollingIds.has(String(id))) pendingIds.add(id);
      const failure = results[index]?.error;
      if (failure !== undefined && failure !== null)
        errors[id] = failure instanceof Error ? failure.message : String(failure);
      else if (pollErrors[id] !== undefined) errors[id] = pollErrors[id]!;
    });
    return { files, pendingIds, errors };
  }, [ids, pollErrors, pollingIds, results]);
}

function setOpInFlight(id: number, op: "pause" | "resume" | "remove" | null): void {
  const opInFlight = torrentAtoms.opInFlight.get();
  if (op === null) {
    if (opInFlight[id] === undefined) return;
    const next = { ...opInFlight };
    delete next[id];
    torrentAtoms.opInFlight.set(next);
    return;
  }
  torrentAtoms.opInFlight.set({ ...opInFlight, [id]: op });
}

export function usePauseTorrent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: number; infoHash?: string }) => {
      const { id } = vars;
      if (torrentAtoms.opInFlight.get()[id] !== undefined) return false;
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
        return false;
      }
      queryClient.invalidateQueries({ queryKey: TORRENTS_QUERY_KEY });
      return true;
    },
  });
}

export function useResumeTorrent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: number; infoHash?: string }) => {
      const { id } = vars;
      if (torrentAtoms.opInFlight.get()[id] !== undefined) return false;
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
        return false;
      }
      queryClient.invalidateQueries({ queryKey: TORRENTS_QUERY_KEY });
      if (!result) return true;
      queryClient.invalidateQueries({ queryKey: torrentFilesKey(result.id) });
      if (result.rechecked) notifyResumeReverified(result.check);
      return true;
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

export interface RemoveTorrentVars {
  id: number;
  deleteFiles: boolean;
  infoHash?: string;
  name?: string;
  silent?: boolean;
}

export function useRemoveTorrent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: RemoveTorrentVars) => {
      const { id } = vars;
      if (!Number.isInteger(id)) return false;
      if (torrentAtoms.opInFlight.get()[id] !== undefined) return false;
      const prev = queryClient.getQueryData<TorrentInfo[]>(TORRENTS_QUERY_KEY);
      setOpInFlight(id, "remove");
      queryClient.setQueryData<TorrentInfo[]>(TORRENTS_QUERY_KEY, (old) =>
        withoutPendingRemoved(old ?? [], new Set([id]))
      );
      const noticeId = vars.silent
        ? -1
        : addNotification(
            tr("torrent.delete.title"),
            "info",
            vars.name ?? String(id),
            `torrent-remove:${id}:${vars.infoHash ?? ""}`,
            { system: false }
          );
      if (noticeId > 0) updateNotification(noticeId, { progress: true });
      const [, error] = await attempt(
        torrentApi.removeTorrent(id, vars.deleteFiles, vars.infoHash)
      );
      setOpInFlight(id, null);
      const partial =
        error?.message.startsWith("torrent deleted, but could not delete files:") === true;
      if (error) {
        if (!partial && prev !== undefined) queryClient.setQueryData(TORRENTS_QUERY_KEY, prev);
        const text = torrentErrorText(error.message, tr);
        if (noticeId > 0) {
          updateNotification(
            noticeId,
            partial
              ? { message: text, progress: false, type: "warning" }
              : {
                  message: text,
                  progress: false,
                  title: tr("download.error.remove"),
                  type: "error",
                },
            { system: true }
          );
        } else {
          showError(tr("download.error.remove"), text);
        }
        return false;
      }
      removeSeedPreference(id);
      queryClient.setQueryData<TorrentInfo[]>(TORRENTS_QUERY_KEY, (old) =>
        (old ?? []).filter((t) => t.id !== id)
      );
      queryClient.removeQueries({ queryKey: torrentFilesKey(id) });
      const lastActiveAt = { ...torrentAtoms.lastActiveAt.get() };
      delete lastActiveAt[id];
      torrentAtoms.lastActiveAt.set(lastActiveAt);
      if (noticeId > 0) {
        updateNotification(
          noticeId,
          {
            message: tr("torrent.delete.done", { name: vars.name ?? String(id) }),
            progress: false,
            type: "success",
          },
          { system: true }
        );
      }
      return true;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TORRENTS_QUERY_KEY });
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
        throw new Error(error.message);
      }
    },
    onMutate: async (vars) => {
      const key = torrentFilesKey(vars.id);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TorrentFileInfo[]>(key);
      const wanted = new Set(vars.indices);
      queryClient.setQueryData<TorrentFileInfo[]>(key, (old) =>
        old?.map((file) => ({ ...file, selected: wanted.has(file.index) }))
      );
      return { previous };
    },
    onError: (_error, vars, context) => {
      if (context?.previous !== undefined)
        queryClient.setQueryData(torrentFilesKey(vars.id), context.previous);
    },
    onSettled: (_data, _error, vars) => {
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
        throw new Error(error.message);
      }
    },
    onMutate: async (vars) => {
      const key = torrentFilesKey(vars.id);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TorrentFileInfo[]>(key);
      const wanted = new Set(vars.fileIndices);
      queryClient.setQueryData<TorrentFileInfo[]>(key, (old) =>
        old?.map((file) => (wanted.has(file.index) ? { ...file, priority: vars.priority } : file))
      );
      return { previous };
    },
    onError: (_error, vars, context) => {
      if (context?.previous !== undefined)
        queryClient.setQueryData(torrentFilesKey(vars.id), context.previous);
    },
    onSettled: (_data, _error, vars) => {
      queryClient.invalidateQueries({ queryKey: torrentFilesKey(vars.id) });
    },
  });
}

function patchTorrentInfo(
  queryClient: QueryClient,
  id: number,
  patch: Partial<TorrentInfo>
): TorrentInfo[] | undefined {
  const previous = queryClient.getQueryData<TorrentInfo[]>(TORRENTS_QUERY_KEY);
  queryClient.setQueryData<TorrentInfo[]>(TORRENTS_QUERY_KEY, (old) =>
    old?.map((item) => (item.id === id ? { ...item, ...patch } : item))
  );
  return previous;
}

export function useSetSequentialDownload() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: number; enabled: boolean; infoHash?: string }) => {
      const [, error] = await attempt(
        torrentApi.setSequentialDownload(vars.id, vars.enabled, vars.infoHash)
      );
      if (error) {
        showError(tr("download.error.sequential"), torrentErrorText(error.message, tr));
        throw new Error(error.message);
      }
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: TORRENTS_QUERY_KEY });
      const previous = patchTorrentInfo(queryClient, vars.id, {
        sequential_download: vars.enabled,
      });
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous !== undefined)
        queryClient.setQueryData(TORRENTS_QUERY_KEY, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TORRENTS_QUERY_KEY });
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
        throw new Error(error.message);
      }
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: TORRENTS_QUERY_KEY });
      const previous = patchTorrentInfo(queryClient, vars.id, { download_order: vars.indices });
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous !== undefined)
        queryClient.setQueryData(TORRENTS_QUERY_KEY, context.previous);
    },
    onSettled: (_data, _error, vars) => {
      queryClient.invalidateQueries({ queryKey: TORRENTS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: torrentFilesKey(vars.id) });
    },
  });
}

export function useSetTorrentAlias() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: number; alias: string | null; infoHash?: string }) => {
      const [, error] = await attempt(
        torrentApi.setTorrentAlias(vars.id, vars.alias, vars.infoHash)
      );
      if (error) {
        showError(tr("download.error.alias"), torrentErrorText(error.message, tr));
        throw new Error(error.message);
      }
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: TORRENTS_QUERY_KEY });
      const previous = queryClient.getQueryData<TorrentInfo[]>(TORRENTS_QUERY_KEY);
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous !== undefined)
        queryClient.setQueryData(TORRENTS_QUERY_KEY, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TORRENTS_QUERY_KEY });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.torrentDiagnostics(vars.id) });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.torrentDiagnostics(vars.id) });
      queryClient.invalidateQueries({ queryKey: TORRENTS_QUERY_KEY });
      return true;
    },
  });
}
