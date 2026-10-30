import type {
  CollectionItem,
  CollectionStatus,
  CollectionStatusDef,
  FilterParams,
} from "@/types/anilist/collection";
import type { TagToleranceKey } from "@/types/search/search";

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
