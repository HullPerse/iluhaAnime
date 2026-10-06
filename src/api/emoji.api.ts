import type { ApiTransport } from "./transport.api";
import { tauriTransport } from "./transport.api";

interface EmojiFile {
  name: string;
  path: string;
}

interface EmojiApiConfig {
  transport?: ApiTransport;
}

class EmojiApi {
  private readonly transport: ApiTransport;

  constructor(config: EmojiApiConfig = {}) {
    this.transport = config.transport ?? tauriTransport;
  }

  list(): Promise<EmojiFile[]> {
    return this.transport.call<EmojiFile[]>("emoji_list");
  }
}

export const emojiApi = new EmojiApi();
