import type { GamePlatform } from "@/types/core/game";
import type { ApiTransport } from "@/types/core/transport";

export interface GameApiConfig {
  transport?: ApiTransport;
}

export interface GameImportInput {
  path: string;
  platform?: GamePlatform;
  name?: string;
}
