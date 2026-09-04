import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useMemo } from "react";

import { buildCollectionSearchIndex, searchCollectionIndex } from "@/lib/collectionSearch.utils";
import { parseIntent } from "@/lib/intentParser.utils";
import type {
  CollectionItem,
  CollectionStatusDef,
  CustomFieldDef,
  ReleaseSubscription,
} from "@/types/collection";

export const COLLECTION_QUERY_KEY = "collection-data" as const;

export const DEFAULT_COLLECTION_STATUSES: CollectionStatusDef[] = [
  { id: "favorites", label: "Favorites", color: "#ec4899", order: 0, isCore: true },
  { id: "planned", label: "Planned", color: "#9ca3af", order: 1, isCore: true },
  {
    id: "watching",
    label: "Watching",
    color: "#3b82f6",
    order: 2,
    isCore: true,
  },
  {
    id: "completed",
    label: "Completed",
    color: "#22c55e",
    order: 3,
    isCore: true,
  },
  { id: "paused", label: "Paused", color: "#f59e0b", order: 4, isCore: true },
  { id: "dropped", label: "Dropped", color: "#ef4444", order: 5, isCore: true },
  {
    id: "rewatching",
    label: "Rewatching",
    color: "#a855f7",
    order: 6,
    isCore: true,
  },
];

interface CollectionDataState {
  items: CollectionItem[];
  customFieldDefs: CustomFieldDef[];
  statuses: CollectionStatusDef[];
}

const EMPTY: CollectionDataState = {
  items: [],
  customFieldDefs: [],
  statuses: DEFAULT_COLLECTION_STATUSES,
};

interface RawCollectionItem extends Omit<
  CollectionItem,
  "isFavorite" | "sitesToView" | "tvCurrentSeason" | "tvCurrentEpisode" | "detailsJson"
> {
  isFavorite: boolean | number;
  sitesToView?: unknown;
  tvCurrentSeason?: number | null;
  tvCurrentEpisode?: number | null;
  detailsJson?: unknown;
}

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

async function fetchCollectionData(): Promise<CollectionDataState> {
  try {
    const [items, customFieldDefs, statuses] = await Promise.all([
      invoke<RawCollectionItem[]>("list_collection_items"),
      invoke<CustomFieldDef[]>("list_custom_field_defs"),
      invoke<CollectionStatusDef[]>("list_collection_statuses"),
    ]);
    return {
      items: items.map(normalizeItem),
      customFieldDefs,
      statuses: statuses.length > 0 ? statuses : DEFAULT_COLLECTION_STATUSES,
    };
  } catch {
    return EMPTY;
  }
}

export function useCollectionSearch(query: string, allItems: CollectionItem[]): CollectionItem[] {
  const intent = parseIntent(query);
  const trimmed = intent.cleanQuery.trim();
  const index = useMemo(() => buildCollectionSearchIndex(allItems), [allItems]);
  return trimmed.length < 3 ? allItems : searchCollectionIndex(index, trimmed);
}

export function useCollectionData(): CollectionDataState {
  const { data } = useQuery({
    queryKey: [COLLECTION_QUERY_KEY],
    queryFn: fetchCollectionData,
    staleTime: 60_000,
    gcTime: Infinity,
  });
  return data ?? EMPTY;
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
      await invoke("upsert_collection_item", { item: full });
      return id;
    },
    onSuccess: invalidate,
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<CollectionItem> }) => {
      const items = await invoke<RawCollectionItem[]>("list_collection_items");
      const cur = items.find((i) => i.id === id);
      if (!cur) return;
      const next: CollectionItem = {
        ...normalizeItem(cur),
        ...patch,
        updatedAt: Date.now(),
      };
      await invoke("upsert_collection_item", { item: next });
    },
    onSuccess: invalidate,
  });

  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      await invoke("delete_collection_item", { id });
    },
    onSuccess: invalidate,
  });

  const addCustomFieldDef = useMutation({
    mutationFn: async (def: Omit<CustomFieldDef, "id">) => {
      const id = genId("cf");
      const full: CustomFieldDef = { ...def, id };
      await invoke("upsert_custom_field_def", { def: full });
      return id;
    },
    onSuccess: invalidate,
  });

  const upsertStatus = useMutation({
    mutationFn: async (status: CollectionStatusDef) => {
      await invoke("upsert_collection_status", { status });
    },
    onSuccess: invalidate,
  });

  const deleteStatus = useMutation({
    mutationFn: async (id: string) => {
      await invoke("delete_collection_status", { id });
    },
    onSuccess: invalidate,
  });

  const removeCustomFieldDef = useMutation({
    mutationFn: async (id: string) => {
      await invoke("delete_custom_field_def", { id });
    },
    onSuccess: invalidate,
  });

  return {
    addItem: (item: Omit<CollectionItem, "id" | "addedAt" | "updatedAt">) =>
      addItem.mutateAsync({ item }),
    updateItem: (id: string, patch: Partial<CollectionItem>) =>
      updateItem.mutateAsync({ id, patch }),
    removeItem: (id: string) => removeItem.mutateAsync(id),
    addCustomFieldDef: (def: Omit<CustomFieldDef, "id">) => addCustomFieldDef.mutateAsync(def),
    removeCustomFieldDef: (id: string) => removeCustomFieldDef.mutateAsync(id),
    upsertStatus: (status: CollectionStatusDef) => upsertStatus.mutateAsync(status),
    deleteStatus: (id: string) => deleteStatus.mutateAsync(id),
  };
}

const RELEASE_KEY = "release-subscriptions" as const;

export function useReleaseSubscriptions(): ReleaseSubscription[] {
  const { data } = useQuery({
    queryKey: [RELEASE_KEY],
    queryFn: async () => invoke<ReleaseSubscription[]>("list_release_subscriptions"),
    staleTime: 0,
  });
  return data ?? [];
}

export function useReleaseSubscriptionMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [RELEASE_KEY] });
  const genId = (prefix: string) =>
    `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
  const upsert = useMutation({
    mutationFn: async (sub: Omit<ReleaseSubscription, "id" | "createdAt"> & { id?: string }) => {
      const full: ReleaseSubscription = {
        id: sub.id ?? genId("rel"),
        mediaId: sub.mediaId,
        mediaType: sub.mediaType,
        title: sub.title,
        lastCheckedAt: sub.lastCheckedAt ?? null,
        nextAiringAt: sub.nextAiringAt ?? null,
        createdAt: Date.now(),
      };
      await invoke("upsert_release_subscription", { sub: full });
      return full.id;
    },
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => invoke("delete_release_subscription", { id }),
    onSuccess: invalidate,
  });
  return {
    upsert: (sub: Omit<ReleaseSubscription, "id" | "createdAt"> & { id?: string }) =>
      upsert.mutateAsync(sub),
    remove: (id: string) => remove.mutateAsync(id),
  };
}
