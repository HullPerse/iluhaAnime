import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import {
  createCollectionFilterSnapshot,
  queryCollectionFilterSnapshot,
} from "@/lib/collection/filter.utils";
import type { CollectionFilterSnapshot } from "@/lib/collection/filter.utils";
import { reportBackgroundError } from "@/lib/utils/attempt.utils";
import { createJobRunner } from "@/lib/workers/job.utils";
import type { JobRunner } from "@/lib/workers/job.utils";
import type {
  CollectionFilterWorkerPayload,
  CollectionFilterWorkerResult,
  CollectionItem,
  CollectionStatus,
  CollectionStatusDef,
  FilterParams,
} from "@/types/collection";
import type { TagToleranceKey } from "@/types/search";

export interface CollectionFilterWorkerParams {
  items: CollectionItem[];
  statuses: CollectionStatusDef[];
  searchQuery: string;
  selectedStatus: CollectionStatus | "all";
  filters: FilterParams;
  sortBy: "date" | "name" | "rating" | "year";
  sortDir: "asc" | "desc";
  intentEnabled: boolean;
  tagTolerances: Record<TagToleranceKey, number>;
}

export function useCollectionFilterWorker(params: CollectionFilterWorkerParams): {
  filtered: CollectionItem[];
  isStale: boolean;
} {
  const {
    items,
    statuses,
    searchQuery,
    selectedStatus,
    filters,
    sortBy,
    sortDir,
    intentEnabled,
    tagTolerances,
  } = params;
  const deferredQuery = useDeferredValue(searchQuery);
  const [ids, setIds] = useState<string[] | null>(null);
  const [stale, setStale] = useState(false);
  const syncSnapshot = useRef<CollectionFilterSnapshot | null>(null);
  const runnerRef = useRef<JobRunner<CollectionFilterWorkerPayload> | null>(null);

  useEffect(() => {
    const runner = createJobRunner<
      CollectionFilterWorkerPayload,
      CollectionFilterWorkerResult
    >({
      createWorker: () =>
        new Worker(new URL("../../lib/workers/collection.worker", import.meta.url), {
          type: "module",
        }),
      onResult: (result) => {
        if (result === null) return;
        setIds(result);
        setStale(false);
      },
      onError: (error) => {
        setStale(false);
        reportBackgroundError("collection filter worker", error);
      },
      runSync: (payload) => {
        if (payload.kind === "init") {
          syncSnapshot.current = createCollectionFilterSnapshot(
            payload.items,
            payload.statuses
          );
          return null;
        }
        const snapshot = syncSnapshot.current;
        if (!snapshot) return [];
        return queryCollectionFilterSnapshot(snapshot, payload);
      },
    });
    runnerRef.current = runner;
    return () => {
      runner.dispose();
      runnerRef.current = null;
    };
  }, []);

  const initialIds = useMemo(() => items.map((item) => item.id), [items]);

  useEffect(() => {
    runnerRef.current?.run({ kind: "init", items, statuses });
  }, [items, statuses]);

  useEffect(() => {
    setStale(true);
    runnerRef.current?.run({
      kind: "query",
      searchQuery: deferredQuery,
      selectedStatus,
      filters,
      sortBy,
      sortDir,
      intentEnabled,
      tagTolerances,
    });
  }, [
    deferredQuery,
    items,
    statuses,
    selectedStatus,
    filters,
    sortBy,
    sortDir,
    intentEnabled,
    tagTolerances,
  ]);

  const filtered = useMemo(() => {
    const visible = ids ?? initialIds;
    const byId = new Map(items.map((item) => [item.id, item]));
    return visible
      .map((id) => byId.get(id))
      .filter((item): item is CollectionItem => item !== undefined);
  }, [items, ids, initialIds]);

  return useMemo(() => ({ filtered, isStale: stale }), [filtered, stale]);
}
