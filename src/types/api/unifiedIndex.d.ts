import type { ApiTransport } from "@/types/core/transport";

export interface UnifiedIndexEntryInput {
  id: string;
  kind: string;
  scope: string;
  value: string;
  subtitle?: string;
  metadata?: unknown;
  bumpUse?: boolean;
}

export interface UnifiedIndexApiConfig {
  transport?: ApiTransport;
}
