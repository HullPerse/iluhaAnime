import type { Cell } from "@/types/core/signal";
import type { StreamCatalogFilters, StreamSourceId } from "@/types/player/stream";

export interface StreamSignalStore {
  source: Cell<StreamSourceId>;
  query: Cell<string>;
  page: Cell<number>;
  selectedSlug: Cell<string | null>;
  filters: Cell<StreamCatalogFilters>;
}
