import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import type { Event } from "@tauri-apps/api/event";
import { useEffect, useMemo } from "react";

import {
  TorrentListen,
  findJustFinished,
  findNewErrors,
  torrentErrorText,
} from "@/lib/torrent/common.utils";
import { attempt, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { showError } from "@/lib/utils/notification.utils";
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

let initialErrorNotified = false;
let primedSeedPause = false;
let subscriptionOwners = 0;
let sharedUnlisten: (() => void) | undefined;
let listenPending = false;

function applyTorrentEvent(queryClient: QueryClient, event: Event<TorrentInfo[]>): void {
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
    invokeTyped("pause_torrent", { id: t.id }).catch((error) =>
      reportBackgroundError("torrent.autopause.push", error)
    );
  }
}

function ensureTorrentSubscription(queryClient: QueryClient): () => void {
  subscriptionOwners += 1;
  let cancelled = false;
  if (!sharedUnlisten && !listenPending) {
    listenPending = true;
    listen<TorrentInfo[]>("torrents-update", (event) => {
      if (!cancelled && subscriptionOwners > 0) applyTorrentEvent(queryClient, event);
    })
      .then((unlisten) => {
        listenPending = false;
        if (cancelled || subscriptionOwners <= 0) unlisten();
        else sharedUnlisten = unlisten;
      })
      .catch(() => {
        listenPending = false;
      });
  }
  return () => {
    cancelled = true;
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
    queryFn: () => invokeTyped<TorrentInfo[]>("list_torrents").then((list) => list ?? []),
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
      invokeTyped("pause_torrent", { id: t.id }).catch((error) =>
        reportBackgroundError("torrent.autopause.prime", error)
      );
    }
  }, [enabled, query.data]);
  useEffect(() => {
    if (!enabled) return;
    return ensureTorrentSubscription(queryClient);
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

async function fetchTorrentFiles(queryClient: QueryClient, id: number): Promise<TorrentFileInfo[]> {
  const [files, error] = await attempt(
    invokeTyped<TorrentFileInfo[]>("get_running_torrent_files", { id })
  );
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
      const [, error] = await attempt(
        invokeTyped("pause_torrent", { id, infoHash: vars.infoHash })
      );
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
      const [, error] = await attempt(
        invokeTyped("resume_torrent", { id, infoHash: vars.infoHash })
      );
      setOpInFlight(id, null);
      if (error) {
        showError(tr("download.error.resume"), torrentErrorText(error.message, tr));
        if (prev !== undefined) queryClient.setQueryData(TORRENTS_QUERY_KEY, prev);
      } else {
        queryClient.invalidateQueries({ queryKey: TORRENTS_QUERY_KEY });
      }
    },
  });
}

export function useRemoveTorrent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: number; deleteFiles: boolean; infoHash?: string }) => {
      const { id } = vars;
      if (!Number.isInteger(id)) return false;
      setOpInFlight(id, "remove");
      const [, error] = await attempt(
        invokeTyped("remove_torrent", {
          id,
          deleteFiles: vars.deleteFiles,
          infoHash: vars.infoHash,
        })
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
        invokeTyped("update_torrent_only_files", {
          id: vars.id,
          onlyFiles: vars.indices,
          infoHash: vars.infoHash,
        })
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
        invokeTyped("set_file_priority", {
          id: vars.id,
          fileIndices: vars.fileIndices,
          priority: vars.priority,
          infoHash: vars.infoHash,
        })
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
        invokeTyped("set_sequential_download", {
          id: vars.id,
          enabled: vars.enabled,
          infoHash: vars.infoHash,
        })
      );
      if (error) showError(tr("download.error.sequential"), torrentErrorText(error.message, tr));
    },
  });
}

export function useRedownloadFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: number; fileIndex: number; infoHash: string }) => {
      const [newId, error] = await attempt(invokeTyped<number>("redownload_file", vars));
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
      const [result, error] = await attempt(
        invokeTyped<TorrentCheckResult>("recheck_torrent", vars)
      );
      if (error) {
        showError(tr("download.error.recheck"), torrentErrorText(error.message, tr));
        return null;
      }
      queryClient.invalidateQueries({ queryKey: torrentFilesKey(vars.id) });
      return result;
    },
  });
}
