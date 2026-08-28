import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import type {
  CollectionItem,
  CollectionReview,
  CollectionStatusDef,
  CustomFieldDef,
} from "@/types/collection";

const QUERY_KEY = "collection-data" as const;

export const DEFAULT_COLLECTION_STATUSES: CollectionStatusDef[] = [
  { id: "planned", label: "Planned", color: "#9ca3af", order: 0, isCore: true },
  {
    id: "watching",
    label: "Watching",
    color: "#3b82f6",
    order: 1,
    isCore: true,
  },
  {
    id: "completed",
    label: "Completed",
    color: "#22c55e",
    order: 2,
    isCore: true,
  },
  { id: "paused", label: "Paused", color: "#f59e0b", order: 3, isCore: true },
  { id: "dropped", label: "Dropped", color: "#ef4444", order: 4, isCore: true },
  {
    id: "rewatching",
    label: "Rewatching",
    color: "#a855f7",
    order: 5,
    isCore: true,
  },
];

interface CollectionDataState {
  items: CollectionItem[];
  reviews: CollectionReview[];
  customFieldDefs: CustomFieldDef[];
  statuses: CollectionStatusDef[];
}

const EMPTY: CollectionDataState = {
  items: [],
  reviews: [],
  customFieldDefs: [],
  statuses: DEFAULT_COLLECTION_STATUSES,
};

// Rust returns camelCase via serde rename_all, but numbers/booleans land as-is.
// Map to strict TS types: number-ish fields stay number, isFavorite -> boolean.
interface RawCollectionItem extends Omit<CollectionItem, "isFavorite"> {
  isFavorite: boolean | number;
}

function normalizeItem(raw: RawCollectionItem): CollectionItem {
  return { ...raw, isFavorite: Boolean(raw.isFavorite) };
}

async function fetchCollectionData(): Promise<CollectionDataState> {
  try {
    const [items, reviews, customFieldDefs, statuses] = await Promise.all([
      invoke<RawCollectionItem[]>("list_collection_items"),
      invoke<CollectionReview[]>("list_collection_reviews"),
      invoke<CustomFieldDef[]>("list_custom_field_defs"),
      invoke<CollectionStatusDef[]>("list_collection_statuses"),
    ]);
    return {
      items: items.map(normalizeItem),
      reviews: reviews.map((r) => ({ ...r, orphaned: Boolean(r.orphaned) })),
      customFieldDefs,
      statuses: statuses.length > 0 ? statuses : DEFAULT_COLLECTION_STATUSES,
    };
  } catch {
    // Database not ready (e.g., schema v4 migration pending on first run).
    // Fall back to empty; store seeds defaults via mutation if needed.
    return EMPTY;
  }
}

// FTS5 search via Rust for queries >=3 chars; client-side fallback for shorter.
export function useCollectionSearch(
  query: string,
  allItems: CollectionItem[]
): CollectionItem[] {
  const trimmed = query.trim();
  const { data } = useQuery({
    queryKey: ["collection-search", trimmed],
    queryFn: async (): Promise<CollectionItem[]> => {
      if (trimmed.length < 3) return allItems;
      try {
        const res = await invoke<RawCollectionItem[]>(
          "search_collection_items",
          {
            query: trimmed,
            limit: 500,
          }
        );
        return res.map(normalizeItem);
      } catch {
        return allItems;
      }
    },
    staleTime: 0,
  });
  if (trimmed.length < 3) return allItems;
  return data ?? allItems;
}

export function useCollectionData(): CollectionDataState {
  const { data } = useQuery({
    queryKey: [QUERY_KEY],
    queryFn: fetchCollectionData,
    // Keep fresh: data is the source of truth, UI mutations invalidate.
    staleTime: 0,
    gcTime: Infinity,
  });
  return data ?? EMPTY;
}

export function useCollectionMutations() {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });

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
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<CollectionItem>;
    }) => {
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

  const addReview = useMutation({
    mutationFn: async ({
      itemId,
      review,
    }: {
      itemId: string;
      review: Omit<
        CollectionReview,
        | "id"
        | "itemId"
        | "createdAt"
        | "updatedAt"
        | "orphaned"
        | "snapshotTitle"
      >;
    }) => {
      const id = genId("rev");
      const at = Date.now();
      const full: CollectionReview = {
        ...review,
        id,
        itemId,
        createdAt: at,
        updatedAt: at,
        orphaned: false,
        snapshotTitle: null,
      };
      await invoke("upsert_collection_review", { review: full });
      return id;
    },
    onSuccess: invalidate,
  });

  const updateReview = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<CollectionReview, "rating" | "comment">>;
    }) => {
      const reviews = await invoke<CollectionReview[]>(
        "list_collection_reviews"
      );
      const cur = reviews.find((r) => r.id === id);
      if (!cur) return;
      await invoke("upsert_collection_review", {
        review: { ...cur, ...patch, updatedAt: Date.now() },
      });
    },
    onSuccess: invalidate,
  });

  const removeReview = useMutation({
    mutationFn: async (id: string) => {
      await invoke("delete_collection_review", { id });
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
    addReview: (
      itemId: string,
      review: Omit<
        CollectionReview,
        | "id"
        | "itemId"
        | "createdAt"
        | "updatedAt"
        | "orphaned"
        | "snapshotTitle"
      >
    ) => addReview.mutateAsync({ itemId, review }),
    updateReview: (
      id: string,
      patch: Partial<Pick<CollectionReview, "rating" | "comment">>
    ) => updateReview.mutateAsync({ id, patch }),
    removeReview: (id: string) => removeReview.mutateAsync(id),
    addCustomFieldDef: (def: Omit<CustomFieldDef, "id">) =>
      addCustomFieldDef.mutateAsync(def),
    removeCustomFieldDef: (id: string) => removeCustomFieldDef.mutateAsync(id),
    upsertStatus: (status: CollectionStatusDef) =>
      upsertStatus.mutateAsync(status),
    deleteStatus: (id: string) => deleteStatus.mutateAsync(id),
  };
}
