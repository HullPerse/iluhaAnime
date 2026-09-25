import { useCallback, useRef, useState } from "react";

import { anilistApi } from "@/api/anilist.api";
import { searchFiltersToParams } from "@/lib/anilist/entries.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { showError } from "@/lib/utils/notification.utils";
import type { AniListFilters, AniMedia } from "@/types/anilist";
import type { FilterPage } from "@/types/ipc";

export interface DiscoveryQueue<T> {
  history: T[];
  index: number;
  current: T | undefined;
  total: number;
  canPrev: boolean;
  push: (item: T) => void;
  prev: () => void;
  reset: () => void;
}

export function useDiscoveryQueue<T>(): DiscoveryQueue<T> {
  const [state, setState] = useState<{ history: T[]; index: number }>({
    history: [],
    index: 0,
  });
  const push = useCallback((item: T) => {
    setState((prev) => {
      const kept = prev.history.slice(0, prev.index + 1);
      return { history: [...kept, item], index: kept.length };
    });
  }, []);
  const prev = useCallback(() => {
    setState((prev) => ({ ...prev, index: Math.max(0, prev.index - 1) }));
  }, []);
  const reset = useCallback(() => {
    setState({ history: [], index: 0 });
  }, []);
  return {
    history: state.history,
    index: state.index,
    current: state.history[state.index],
    total: state.history.length,
    canPrev: state.index > 0,
    push,
    prev,
    reset,
  };
}

const FILTER_RANDOM_PER_PAGE = 50;

async function fetchRandomMedia(
  filters: AniListFilters,
  seen: Set<number>
): Promise<AniMedia | null> {
  const baseArgs = { ...searchFiltersToParams(filters, null, FILTER_RANDOM_PER_PAGE, 1) };
  const [first, firstError] = await attempt(anilistApi.filterPage({ ...baseArgs, page: 1 }));
  if (firstError || !first || first.total === 0) return null;
  const pages = Math.max(1, Math.ceil(first.total / FILTER_RANDOM_PER_PAGE));
  const page = 1 + Math.floor(Math.random() * pages);
  const [pageData, pageError]: [FilterPage | null, Error | null] =
    page === 1 ? [first, null] : await attempt(anilistApi.filterPage({ ...baseArgs, page }));
  if (pageError) return null;
  const pool = pageData?.media ?? [];
  const fresh = pool.filter((media) => !seen.has(media.id));
  const source = fresh.length > 0 ? fresh : pool;
  return source.length > 0 ? (source[Math.floor(Math.random() * source.length)] ?? null) : null;
}

export interface RandomDiscovery {
  open: boolean;
  current: AniMedia | undefined;
  index: number;
  total: number;
  canPrev: boolean;
  pending: boolean;
  start: (filters: AniListFilters) => void;
  reroll: () => void;
  prev: () => void;
  close: () => void;
}

export function useRandomDiscovery(): RandomDiscovery {
  const { t } = useI18n();
  const queue = useDiscoveryQueue<AniMedia>();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const filtersRef = useRef<AniListFilters | null>(null);
  const seenRef = useRef<Set<number>>(new Set());
  const pendingRef = useRef(false);
  const start = useCallback(
    (filters: AniListFilters) => {
      if (pendingRef.current) return;
      pendingRef.current = true;
      setPending(true);
      filtersRef.current = filters;
      seenRef.current = new Set();
      queue.reset();
      (async () => {
        const [pick, error] = await attempt(fetchRandomMedia(filters, seenRef.current));
        if (error || !pick) {
          showError(
            t("anilist.filters.random"),
            t(error ? "anilist.filters.random.error" : "anilist.filters.random.empty")
          );
          setOpen(false);
        } else {
          seenRef.current.add(pick.id);
          queue.push(pick);
          setOpen(true);
        }
        pendingRef.current = false;
        setPending(false);
      })();
    },
    [queue, t]
  );
  const reroll = useCallback(() => {
    const filters = filtersRef.current;
    if (pendingRef.current || !filters) return;
    pendingRef.current = true;
    setPending(true);
    (async () => {
      const [pick, error] = await attempt(fetchRandomMedia(filters, seenRef.current));
      if (error || !pick) {
        showError(
          t("anilist.filters.random"),
          t(error ? "anilist.filters.random.error" : "anilist.filters.random.empty")
        );
      } else {
        seenRef.current.add(pick.id);
        queue.push(pick);
      }
      pendingRef.current = false;
      setPending(false);
    })();
  }, [queue, t]);
  const close = useCallback(() => {
    filtersRef.current = null;
    seenRef.current = new Set();
    queue.reset();
    setOpen(false);
  }, [queue]);
  return {
    open,
    current: queue.current,
    index: queue.index,
    total: queue.total,
    canPrev: queue.canPrev,
    pending,
    start,
    reroll,
    prev: queue.prev,
    close,
  };
}
