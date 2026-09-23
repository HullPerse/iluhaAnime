import type {
  CollectionItem,
  CollectionStatusDef,
  CustomFieldDef,
  RawCollectionItem,
} from "@/types/collection";
import type { UnifiedIndexRow } from "@/types/search";

import type { ApiTransport } from "./transport.api";
import { tauriTransport } from "./transport.api";

export interface CollectionStatusRow extends Omit<CollectionStatusDef, "order" | "kind"> {
  order?: number;
  orderIndex?: number;
  kind?: CollectionStatusDef["kind"];
}

export interface UnifiedIndexEntryInput {
  id: string;
  kind: string;
  scope: string;
  value: string;
  subtitle?: string;
  metadata?: unknown;
}

export interface CollectionApiConfig {
  transport?: ApiTransport;
}

export interface ImportBatchOutcome {
  imported: number;
  failed: Array<{ index: number; error: string }>;
}

export interface CollectionImportSummary {
  imported: number;
  skipped: number;
  overwritten: number;
  created: number;
}

export class CollectionApi {
  private readonly transport: ApiTransport;

  constructor(config: CollectionApiConfig = {}) {
    this.transport = config.transport ?? tauriTransport;
  }

  private call<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
    return this.transport.call<T>(command, args);
  }

  listItems(): Promise<RawCollectionItem[]> {
    return this.call("list_collection_items");
  }

  listCustomFieldDefs(): Promise<CustomFieldDef[]> {
    return this.call("list_custom_field_defs");
  }

  listStatuses(): Promise<CollectionStatusRow[]> {
    return this.call("list_collection_statuses");
  }

  upsertItem(item: CollectionItem): Promise<void> {
    return this.call("upsert_collection_item", { item });
  }

  patchItem(id: string, patch: Partial<CollectionItem>, touch?: boolean): Promise<void> {
    return this.call("patch_collection_item", { id, patch, touch_updated: touch });
  }

  deleteItem(id: string): Promise<void> {
    return this.call("delete_collection_item", { id });
  }

  upsertCustomFieldDef(def: CustomFieldDef): Promise<void> {
    return this.call("upsert_custom_field_def", { def });
  }

  deleteCustomFieldDef(id: string): Promise<void> {
    return this.call("delete_custom_field_def", { id });
  }

  upsertStatus(status: CollectionStatusDef): Promise<void> {
    const { order, ...rest } = status;
    return this.call("upsert_collection_status", { status: { ...rest, orderIndex: order } });
  }

  upsertStatusRow(status: CollectionStatusRow): Promise<void> {
    return this.call("upsert_collection_status", { status });
  }

  deleteStatus(id: string): Promise<void> {
    return this.call("delete_collection_status", { id });
  }

  importItemsBatch(items: unknown[]): Promise<ImportBatchOutcome> {
    return this.call("import_collection_items_batch", { items });
  }

  exportData(): Promise<unknown> {
    return this.call("export_collection_data");
  }

  exportZip(outPath: string): Promise<void> {
    return this.call("export_collection_zip", { outPath });
  }

  importData(data: unknown, strategy: string): Promise<CollectionImportSummary> {
    return this.call("import_collection_data", { data, strategy });
  }

  searchUnifiedIndex(
    query: string,
    scope?: string | null,
    limit?: number
  ): Promise<UnifiedIndexRow[]> {
    return this.call("search_unified_index", { query, scope, limit });
  }

  upsertUnifiedIndex(entries: UnifiedIndexEntryInput[]): Promise<void> {
    return this.call("upsert_unified_index", { entries });
  }

  optimizeUnifiedIndex(): Promise<void> {
    return this.call("optimize_unified_index");
  }

  clearUnifiedIndexScope(scope: string): Promise<void> {
    return this.call("clear_unified_index_scope", { scope });
  }

  pruneUnifiedIndexScope(scope: string, keepIds: string[]): Promise<void> {
    return this.call("prune_unified_index_scope", { scope, keepIds });
  }

  recordUnifiedIndexAction(action: string, id: string): Promise<void> {
    return this.call("record_unified_index_action", { action, id });
  }
}

export const collectionApi = new CollectionApi();
