import type { ApiTransport } from "@/types/core/transport";

export interface StreamApiConfig {
  transport?: ApiTransport;
  proxyUrl?: string | null | (() => string | null);
}

export interface AnimeLibAccount {
  tokenSaved: boolean;
  /** The API accepted the stored token; `login` may still be missing. */
  authorized: boolean;
  login: string | null;
}
