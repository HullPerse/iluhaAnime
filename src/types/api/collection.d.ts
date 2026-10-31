import type { CollectionStatusDef } from "@/types/anilist/collection";
import type { ApiTransport } from "@/types/core/transport";

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
  bumpUse?: boolean;
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
