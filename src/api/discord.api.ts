import { tauriTransport } from "@/api/transport.api";
import type { ApiTransport } from "@/types/transport";
import type { DiscordActivity, DiscordPresenceSource } from "@/types/discord";

export interface DiscordApiConfig {
  transport?: ApiTransport;
}

/**
 * Talks to the Rust presence manager. The manager owns the Discord pipe, so a
 * missing Discord client never turns into a failed command here.
 */
export class DiscordApi {
  private readonly transport: ApiTransport;

  constructor(config: DiscordApiConfig = {}) {
    this.transport = config.transport ?? tauriTransport;
  }

  private call<T>(command: string, args?: Record<string, unknown>): Promise<Awaited<T>> {
    return this.transport.call<T>(command, args);
  }

  configure(enabled: boolean): Promise<void> {
    return this.call("discord_presence_configure", { enabled });
  }

  set(source: DiscordPresenceSource, activity: DiscordActivity): Promise<void> {
    return this.call("discord_presence_set", { source, activity });
  }

  clear(source: DiscordPresenceSource): Promise<void> {
    return this.call("discord_presence_clear", { source });
  }
}

export const discordApi = new DiscordApi();
