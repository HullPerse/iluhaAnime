import { DEFAULT_STREAM_FILTERS } from "@/config/player/streamFilters.config";
import { DEFAULT_STREAM_SOURCE, STREAM_SOURCES } from "@/config/player/streamSources.config";
import { attemptSync } from "@hullperse/hp_utils/attempt";
import { createSignalStore } from "@hullperse/hp_utils/signal";
import type { StreamSignalStore } from "@/types/store/stream";
import type { StreamCatalogFilters, StreamSortBy, StreamSourceId } from "@/types/player/stream";

const SOURCE_STORAGE_KEY = "iluha.v1.stream-source";
const SOURCE_VALUES = new Set<string>(STREAM_SOURCES.map((source) => source.id));

function readStreamSource(): StreamSourceId {
  const [raw] = attemptSync(() => localStorage.getItem(SOURCE_STORAGE_KEY));

  return raw && SOURCE_VALUES.has(raw) ? (raw as StreamSourceId) : DEFAULT_STREAM_SOURCE;
}

function persistStreamSource(source: StreamSourceId): void {
  attemptSync(() => localStorage.setItem(SOURCE_STORAGE_KEY, source));
}

function createStreamSignalStore(): StreamSignalStore {
  const store = createSignalStore();

  return {
    source: store.atom<StreamSourceId>("stream.source", readStreamSource()),
    query: store.atom("stream.query", ""),
    page: store.atom("stream.page", 1),
    selectedSlug: store.atom<string | null>("stream.selectedSlug", null),
    filters: store.atom<StreamCatalogFilters>("stream.filters", DEFAULT_STREAM_FILTERS),
  };
}

export const streamStore = createStreamSignalStore();

export const streamSource = streamStore.source;
export const streamQuery = streamStore.query;
export const streamPage = streamStore.page;
export const streamSlug = streamStore.selectedSlug;
export const streamFilters = streamStore.filters;

export function selectStreamSource(source: StreamSourceId): void {
  if (streamSource.get() === source) return;
  streamSource.set(source);
  persistStreamSource(source);
  streamSlug.set(null);
  streamPage.set(1);
  streamQuery.set("");
  const filters = streamFilters.get();

  if (source === "allanime" && filters.sortBy !== "name") {
    setStreamSort(filters.sortBy, "desc");
  }
}

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
