import type { ApiTransport } from "@/types/core/transport";
import type { StreamSourceId } from "@/types/player/stream";

export interface StreamApiConfig {
  transport?: ApiTransport;
  proxyUrl?: string | null | (() => string | null);
  proxyForSource?: (source: StreamSourceId) => string | null;
}

export interface AnimeLibAccount {
  tokenSaved: boolean;
  /** The API accepted the stored token; `login` may still be missing. */
  authorized: boolean;
  login: string | null;
}

export interface StreamSourcesInput {
  episodeId: string;
  variantId: string;
}
