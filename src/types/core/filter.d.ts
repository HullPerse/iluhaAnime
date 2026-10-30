import type { TagToleranceKey } from "@/types/search/search";
import type {
  CollectionItem,
  CollectionSearchIndex,
  CollectionStatusDef,
} from "@/types/anilist/collection";

export interface CollectionFilterOptions {
  intentEnabled?: boolean;
  tagTolerances?: Record<TagToleranceKey, number>;
}

export interface CollectionFilterSnapshot {
  items: CollectionItem[];
  statuses: CollectionStatusDef[];
  index: CollectionSearchIndex;
}
