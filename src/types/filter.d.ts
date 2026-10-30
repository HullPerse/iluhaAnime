import type { TagToleranceKey } from "@/types/search";
import type {
  CollectionItem,
  CollectionSearchIndex,
  CollectionStatusDef,
} from "@/types/collection";

export interface CollectionFilterOptions {
  intentEnabled?: boolean;
  tagTolerances?: Record<TagToleranceKey, number>;
}

export interface CollectionFilterSnapshot {
  items: CollectionItem[];
  statuses: CollectionStatusDef[];
  index: CollectionSearchIndex;
}
