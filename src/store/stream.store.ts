import { DEFAULT_STREAM_FILTERS } from "@/config/stream/filters.config";
import { createSignalStore, type Cell } from "@/lib/state/signal.store";
import type { StreamCatalogFilters } from "@/types/stream";

// Client state only. Results, episodes, players and sources are server state
// and belong to the query cache (`hooks/stream/catalog.hook.ts`); duplicating
// them here would give the tab two sources of truth and no cancellation.
//
// Nothing here is persisted: a search query, a page number and an open title
// are session state, and restoring yesterday's search on launch is not a
// behavior anyone asked for.

export interface StreamSignalStore {
  /** The submitted query, not the text in the field. */
  query: Cell<string>;
  /** 1-based page of the current result set. */
  page: Cell<number>;
  /** The title whose detail is open, by slug. Null closes the detail. */
  selectedSlug: Cell<string | null>;
  /** The catalog filters applied to the current search. */
  filters: Cell<StreamCatalogFilters>;
}

export function createStreamSignalStore(): StreamSignalStore {
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

/** Runs a search and puts the tab back on its first page. */
export function submitStreamSearch(query: string): void {
  streamSlug.set(null);
  streamPage.set(1);
  streamQuery.set(query.trim());
}

/** Applies catalog filters; the current query stays, the page starts over. */
export function applyStreamFilters(filters: StreamCatalogFilters): void {
  streamSlug.set(null);
  streamPage.set(1);
  streamFilters.set(filters);
}
