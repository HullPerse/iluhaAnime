import type { LearningStatRow, UnifiedIndexRow } from "@/types/search/search";

import type { ApiTransport } from "@/types/core/transport";
import type { UnifiedIndexApiConfig, UnifiedIndexEntryInput } from "@/types/api/unifiedIndex";
import { tauriTransport } from "@/api/transport.api";

/** Typed client for the unified index commands that search and ranking use. */
class UnifiedIndexApi {
  private readonly transport: ApiTransport;

  constructor(config: UnifiedIndexApiConfig = {}) {
    this.transport = config.transport ?? tauriTransport;
  }

  private call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    return this.transport.call<T>(command, args);
  }

  searchUnifiedIndex(
    query: string,
    scope?: string | null,
    limit?: number
  ): Promise<UnifiedIndexRow[]> {
    return this.call("search_unified_index", { query, scope, limit });
  }

  listLearningStats(ttlDays?: number): Promise<LearningStatRow[]> {
    return this.call("list_learning_stats", { ttlDays });
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

  deleteUnifiedIndexEntry(id: string): Promise<number> {
    return this.call("delete_unified_index_entry", { id });
  }

  recordUnifiedIndexAction(action: string, id: string): Promise<void> {
    return this.call("record_unified_index_action", { action, id });
  }

  recordUnifiedIndexValueAction(
    action: string,
    value: string,
    scope?: string | null
  ): Promise<number> {
    return this.call("record_unified_index_value_action", { action, value, scope });
  }
}

export const unifiedIndexApi = new UnifiedIndexApi();
