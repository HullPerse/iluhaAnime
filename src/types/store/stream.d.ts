import type { Cell } from "@/types/core/signal";
import type { StreamCatalogFilters } from "@/types/player/stream";

export interface StreamSignalStore {
  query: Cell<string>;
  page: Cell<number>;
  selectedSlug: Cell<string | null>;
  filters: Cell<StreamCatalogFilters>;
}
