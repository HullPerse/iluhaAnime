import { DEFAULT_STREAM_FILTERS } from "@/config/player/streamFilters.config";
import { createSignalStore } from "@hullperse/hp_utils/signal";
import type { StreamSignalStore } from "@/types/store/stream";
import type { StreamCatalogFilters, StreamSortBy } from "@/types/player/stream";

function createStreamSignalStore(): StreamSignalStore {
  const store = createSignalStore();

  return {
    query: store.atom("stream.query", ""),
    page: store.atom("stream.page", 1),
    selectedSlug: store.atom<string | null>("stream.selectedSlug", null),
    filters: store.atom<StreamCatalogFilters>("stream.filters", DEFAULT_STREAM_FILTERS),
  };
}

export const streamStore = createStreamSignalStore();

export const streamQuery = streamStore.query;
export const streamPage = streamStore.page;
export const streamSlug = streamStore.selectedSlug;
export const streamFilters = streamStore.filters;

export function submitStreamSearch(query: string): void {
  streamSlug.set(null);
  streamPage.set(1);
  streamQuery.set(query.trim());
}

export function setStreamSort(sortBy: StreamSortBy, sortType: "asc" | "desc"): void {
  const current = streamFilters.get();
  if (current.sortBy === sortBy && current.sortType === sortType) return;
  streamPage.set(1);
  streamFilters.set({ ...current, sortBy, sortType });
}

export function applyStreamFilters(filters: StreamCatalogFilters): void {
  streamSlug.set(null);
  streamPage.set(1);
  streamFilters.set(filters);
}
