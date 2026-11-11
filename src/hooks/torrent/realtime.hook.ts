import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import type { Event } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";

import { torrentApi } from "@/api/torrent.api";
import { TORRENTS_QUERY_KEY } from "@/hooks/torrent/queries.hook";
import { createInterval } from "@hullperse/hp_utils/interval";
import { attempt, reportBackgroundError } from "@hullperse/hp_utils/attempt";
import { showError } from "@/lib/core/ui/notification.utils";
import { tr } from "@/lib/locale/i18n.utils";
import {
  reduceTorrentEvent,
  TORRENT_WATCHDOG_MS,
  findJustFinished,
  findNewErrors,
  pendingRemoveIds,
  shouldHealTorrentChannel,
  withoutPendingRemoved,
} from "@/lib/torrent/torrentCommon.utils";
import { cacheAtoms } from "@/store/cache.store";
import { torrentAtoms } from "@/store/download.store";
import type { TorrentInfo } from "@/types/torrent/torrent";

interface TorrentRealtimeQuery {
  data?: TorrentInfo[];
  error: unknown;
}

function applyTorrentEvent(queryClient: QueryClient, event: Event<TorrentInfo[]>): void {
  const lastActiveAt = torrentAtoms.lastActiveAt.get();
  const prev = queryClient.getQueryData<TorrentInfo[]>(TORRENTS_QUERY_KEY) ?? [];
  const payload = withoutPendingRemoved(
    event.payload,
    pendingRemoveIds(torrentAtoms.opInFlight.get())
  );
  const patch = reduceTorrentEvent({ torrents: prev, lastActiveAt }, { ...event, payload });
  if (patch.torrents !== undefined) queryClient.setQueryData(TORRENTS_QUERY_KEY, patch.torrents);
  if (patch.lastActiveAt !== undefined) torrentAtoms.lastActiveAt.set(patch.lastActiveAt);
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

export function useTorrentRealtime(query: TorrentRealtimeQuery): void {
  const queryClient = useQueryClient();
  const initialErrorNotified = useRef(false);
  const primedSeedPause = useRef(false);

  useEffect(() => {
    if (initialErrorNotified.current || !query.error) return;
    initialErrorNotified.current = true;
    const message = query.error instanceof Error ? query.error.message : String(query.error);
    showError(tr("app.torrent"), message);
  }, [query.error]);

  useEffect(() => {
    if (!query.data || primedSeedPause.current) return;
    primedSeedPause.current = true;
    const prefs = cacheAtoms.seedPreferences.get();
    for (const t of findJustFinished([], query.data, prefs)) {
      torrentApi
        .pauseTorrent(t.id)
        .catch((error) => reportBackgroundError("torrent.autopause.prime", error));
    }
  }, [query.data]);

  useEffect(() => {
    let disposed = false;
    let stopListening: (() => void) | undefined;
    let listenPending = false;
    let lastEventAt = 0;
    let lastHealAt = 0;
    const watchStartedAt = Date.now();

    const onEvent = (event: Event<TorrentInfo[]>) => {
      if (disposed) return;
      lastEventAt = Date.now();
      applyTorrentEvent(queryClient, event);
    };

    const startListening = () => {
      if (disposed || stopListening || listenPending) return;
      listenPending = true;
      (async () => {
        const [stop] = await attempt(listen<TorrentInfo[]>("torrents-update", onEvent));
        listenPending = false;
        if (!stop) return;
        if (disposed) {
          stop();
          return;
        }
        stopListening = stop;
      })();
    };

    startListening();

    const { cancel } = createInterval(() => {
      startListening();
      if (document.hidden) return;
      const now = Date.now();
      if (!shouldHealTorrentChannel({ lastEventAt, watchStartedAt, lastHealAt }, now)) return;
      lastHealAt = now;
      queryClient.invalidateQueries({ queryKey: TORRENTS_QUERY_KEY });
    }, TORRENT_WATCHDOG_MS);

    return () => {
      disposed = true;
      stopListening?.();
      stopListening = undefined;
      cancel();
    };
  }, [queryClient]);
}
