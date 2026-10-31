import type { ApiTransport } from "@/types/core/transport";

export interface StreamApiConfig {
  transport?: ApiTransport;
  proxyUrl?: string | null | (() => string | null);
}
