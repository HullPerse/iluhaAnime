import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { DEFAULT_COLLECTION_STATUSES } from "@/config/collection/statuses.config";
import { buildCollectionSearchIndex, searchCollectionIndex } from "@/lib/collection/search.utils";
import { parseIntent } from "@/lib/search/intent.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import type {
  CollectionDataResult,
  CollectionDataState,
  CollectionItem,
  CollectionStatusDef,
  CustomFieldDef,
  RawCollectionItem,
} from "@/types/collection";

export const COLLECTION_QUERY_KEY = "collection-data" as const;

const EMPTY: CollectionDataState = {
  items: [],
  customFieldDefs: [],
  statuses: DEFAULT_COLLECTION_STATUSES,
};

function normalizeItem(raw: RawCollectionItem): CollectionItem {
  const sitesToView = Array.isArray(raw.sitesToView)
    ? (raw.sitesToView as Array<{ url: string }>)
    : [];
  return {
    ...(raw as unknown as CollectionItem),
    isFavorite: Boolean(raw.isFavorite),
    sitesToView,
    tvCurrentSeason: raw.tvCurrentSeason ?? null,
    tvCurrentEpisode: raw.tvCurrentEpisode ?? null,
    detailsJson: (raw.detailsJson as CollectionItem["detailsJson"]) ?? null,
  };
}

type StatusRow = Omit<CollectionStatusDef, "order"> & { order?: number; orderIndex?: number };

function normalizeStatus(row: StatusRow, fallback: number): CollectionStatusDef {
  return {
    color: row.color,
    id: row.id,
    isCore: row.isCore,
    label: row.label,
    order: row.orderIndex ?? row.order ?? fallback,
  };
}

async function fetchCollectionData(): Promise<CollectionDataState> {
  const [items, customFieldDefs, statusRows] = await Promise.all([
    invokeTyped<RawCollectionItem[]>("list_collection_items"),
    invokeTyped<CustomFieldDef[]>("list_custom_field_defs"),
    invokeTyped<StatusRow[]>("list_collection_statuses"),
  ]);
  const statuses = statusRows.map((row, index) => normalizeStatus(row, index));
  return {
    items: items.map(normalizeItem),
    customFieldDefs,
    statuses: statuses.length > 0 ? statuses : DEFAULT_COLLECTION_STATUSES,
  };
}

export function useCollectionSearch(query: string, allItems: CollectionItem[]): CollectionItem[] {
  const intent = parseIntent(query);
  const trimmed = intent.cleanQuery.trim();
  const index = useMemo(() => buildCollectionSearchIndex(allItems), [allItems]);
  return trimmed.length < 3 ? allItems : searchCollectionIndex(index, trimmed);
}

export function useCollectionData(): CollectionDataResult {
  const { data, isLoading, isError, isFetching, error, refetch } = useQuery({
    queryKey: [COLLECTION_QUERY_KEY],
    queryFn: fetchCollectionData,
    staleTime: 60_000,
    gcTime: Infinity,
  });
  return { ...(data ?? EMPTY), isLoading, isError, isFetching, error, refetch };
}

export function useCollectionMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [COLLECTION_QUERY_KEY] });

  const genId = (prefix: string) =>
    `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;

  const addItem = useMutation({
    mutationFn: async ({
      item,
    }: {
      item: Omit<CollectionItem, "id" | "addedAt" | "updatedAt">;
    }) => {
      const id = genId("item");
      const at = Date.now();
      const full: CollectionItem = { ...item, id, addedAt: at, updatedAt: at };
      await invokeTyped("upsert_collection_item", { item: full });
      return id;
    },
    onSuccess: invalidate,
  });

  const updateItem = useMutation({
    mutationFn: async ({
      id,
      patch,
      touch,
    }: {
      id: string;
      patch: Partial<CollectionItem>;
      touch?: boolean;
    }) => {
      await invokeTyped("patch_collection_item", { id, patch, touch_updated: touch });
    },
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: [COLLECTION_QUERY_KEY] });
      const prev = queryClient.getQueryData<CollectionDataState>([COLLECTION_QUERY_KEY]);
      queryClient.setQueryData<CollectionDataState>([COLLECTION_QUERY_KEY], (old) =>
        old
          ? {
              ...old,
              items: old.items.map((item) =>
                item.id === id ? { ...item, ...patch, updatedAt: Date.now() } : item
              ),
            }
          : old
      );
      return { prev };
    },
    onError: (_error, _variables, context) => {
      if (context?.prev) queryClient.setQueryData([COLLECTION_QUERY_KEY], context.prev);
    },
    onSuccess: invalidate,
  });

  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      await invokeTyped("delete_collection_item", { id });
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: [COLLECTION_QUERY_KEY] });
      const prev = queryClient.getQueryData<CollectionDataState>([COLLECTION_QUERY_KEY]);
      queryClient.setQueryData<CollectionDataState>([COLLECTION_QUERY_KEY], (old) =>
        old ? { ...old, items: old.items.filter((item) => item.id !== id) } : old
      );
      return { prev };
    },
    onError: (_error, _variables, context) => {
      if (context?.prev) queryClient.setQueryData([COLLECTION_QUERY_KEY], context.prev);
    },
    onSuccess: invalidate,
  });

  const addCustomFieldDef = useMutation({
    mutationFn: async (def: Omit<CustomFieldDef, "id">) => {
      const id = genId("cf");
      const full: CustomFieldDef = { ...def, id };
      await invokeTyped("upsert_custom_field_def", { def: full });
      return id;
    },
    onSuccess: invalidate,
  });

  const upsertStatus = useMutation({
    mutationFn: async (status: CollectionStatusDef) => {
      const { order, ...rest } = status;
      await invokeTyped("upsert_collection_status", { status: { ...rest, orderIndex: order } });
    },
    onSuccess: invalidate,
  });

  const deleteStatus = useMutation({
    mutationFn: async (id: string) => {
      await invokeTyped("delete_collection_status", { id });
    },
    onSuccess: invalidate,
  });

  const removeCustomFieldDef = useMutation({
    mutationFn: async (id: string) => {
      await invokeTyped("delete_custom_field_def", { id });
    },
    onSuccess: invalidate,
  });

  return {
    addItem: (item: Omit<CollectionItem, "id" | "addedAt" | "updatedAt">) =>
      addItem.mutateAsync({ item }),
    updateItem: (id: string, patch: Partial<CollectionItem>, opts?: { touch?: boolean }) =>
      updateItem.mutateAsync({ id, patch, touch: opts?.touch }),
    removeItem: (id: string) => removeItem.mutateAsync(id),
    addCustomFieldDef: (def: Omit<CustomFieldDef, "id">) => addCustomFieldDef.mutateAsync(def),
    removeCustomFieldDef: (id: string) => removeCustomFieldDef.mutateAsync(id),
    upsertStatus: (status: CollectionStatusDef) => upsertStatus.mutateAsync(status),
    deleteStatus: (id: string) => deleteStatus.mutateAsync(id),
  };
}
