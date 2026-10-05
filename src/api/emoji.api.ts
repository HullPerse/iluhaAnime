import type { ApiTransport } from "./transport.api";
import { tauriTransport } from "./transport.api";

/** A custom `iluha_*` emoji file found in `<app data>/emoji`. */
export interface EmojiFile {
  /** Lowercased file stem — the chat shortcode is `:<name>:`. */
  name: string;
  /** Absolute path for `convertFileSrc`. */
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

  /** Custom emoji files; empty when the folder is absent or empty. */
  list(): Promise<EmojiFile[]> {
    return this.transport.call<EmojiFile[]>("emoji_list");
  }
}

export const emojiApi = new EmojiApi();
