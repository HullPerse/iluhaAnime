import type { GamePlatform, GameRomInfo, GameStartInfo, GameStoreEntry } from "@/types/game";

import type { ApiTransport } from "@/types/transport";
import { tauriTransport } from "./transport.api";

export interface GameApiConfig {
  transport?: ApiTransport;
}

export interface GameImportInput {
  path: string;
  platform?: GamePlatform;
  name?: string;
}

export class GameApi {
  private readonly transport: ApiTransport;

  constructor(config: GameApiConfig = {}) {
    this.transport = config.transport ?? tauriTransport;
  }

  private call<T>(command: string, args?: Record<string, unknown>): Promise<Awaited<T>> {
    return this.transport.call<T>(command, args);
  }

  platforms(): Promise<GamePlatform[]> {
    return this.call("game_platforms");
  }

  listRoms(): Promise<GameRomInfo[]> {
    return this.call("game_rom_list");
  }

  readRom(id: string): Promise<ArrayBuffer> {
    return this.call("game_rom_read", { id });
  }

  importRom(input: GameImportInput): Promise<GameRomInfo> {
    return this.call("game_rom_import", {
      name: input.name,
      path: input.path,
      platform: input.platform,
    });
  }

  deleteRom(id: string): Promise<void> {
    return this.call("game_rom_delete", { id });
  }

  storeEntries(): Promise<GameStoreEntry[]> {
    return this.call("game_store_list");
  }

  installStoreRom(key: string): Promise<GameRomInfo> {
    return this.call("game_store_install", { key });
  }

  start(id: string): Promise<GameStartInfo> {
    return this.call("game_start", { id });
  }

  tick(session: number, cycles: number, timers: number): Promise<ArrayBuffer> {
    return this.call("game_tick", { cycles, session, timers });
  }

  key(session: number, key: number, pressed: boolean): Promise<void> {
    return this.call("game_key", { key, pressed, session });
  }

  stop(session: number): Promise<void> {
    return this.call("game_stop", { session });
  }
}

export const gameApi = new GameApi();
