import { anilistProxyArgs } from "@/lib/anilist/anilistProxy.utils";
import { assertSchema } from "@/lib/core/system/invoke.utils";
import {
  DailyBootstrapSchema,
  DailyFramesViewSchema,
  DailyGuessViewSchema,
  DailyHistorySchema,
  DailyOpGuessViewSchema,
  DailyOpViewSchema,
} from "@/schemas/daily.schema";
import { tauriTransport } from "@/api/transport.api";
import type {
  DailyBootstrap,
  DailyFramesView,
  DailyGuessView,
  DailyHistoryItem,
  DailyMode,
  DailyOpGuessView,
  DailyOpView,
} from "@/types/api/daily";
import type { ApiTransport } from "@/types/core/transport";

export class DailyApi {
  private readonly transport: ApiTransport;

  constructor(transport: ApiTransport = tauriTransport) {
    this.transport = transport;
  }

  async bootstrap(day: string): Promise<DailyBootstrap> {
    const payload = await this.transport.call<unknown>("daily_game_bootstrap", { day });
    return assertSchema(payload, DailyBootstrapSchema);
  }

  async prepare(
    day: string,
    mode: DailyMode,
    proxyUrl: string | null = null
  ): Promise<DailyFramesView> {
    const payload = await this.transport.call<unknown>("daily_game_prepare", {
      day,
      mode,
      ...anilistProxyArgs(proxyUrl),
    });
    return assertSchema(payload, DailyFramesViewSchema);
  }

  async revealFrames(day: string, proxyUrl: string | null = null): Promise<DailyFramesView> {
    const payload = await this.transport.call<unknown>("daily_game_reveal_frames", {
      day,
      ...anilistProxyArgs(proxyUrl),
    });
    return assertSchema(payload, DailyFramesViewSchema);
  }

  async prepareOp(day: string, proxyUrl: string | null = null): Promise<DailyOpView> {
    const payload = await this.transport.call<unknown>("daily_game_prepare_op", {
      day,
      ...anilistProxyArgs(proxyUrl),
    });
    return assertSchema(payload, DailyOpViewSchema);
  }

  async prepareAudio(day: string, proxyUrl: string | null = null): Promise<DailyOpView> {
    const payload = await this.transport.call<unknown>("daily_game_prepare_audio", {
      day,
      ...anilistProxyArgs(proxyUrl),
    });
    return assertSchema(payload, DailyOpViewSchema);
  }

  async guessAudio(
    day: string,
    mediaId: number,
    guessedTitles: string[]
  ): Promise<DailyOpGuessView> {
    const payload = await this.transport.call<unknown>("daily_game_guess_audio", {
      day,
      mediaId,
      guessedTitles,
    });
    return assertSchema(payload, DailyOpGuessViewSchema);
  }

  async skipAudio(day: string): Promise<DailyOpGuessView> {
    const payload = await this.transport.call<unknown>("daily_game_skip_audio", { day });
    return assertSchema(payload, DailyOpGuessViewSchema);
  }

  async guessOp(day: string, mediaId: number, guessedTitles: string[]): Promise<DailyOpGuessView> {
    const payload = await this.transport.call<unknown>("daily_game_guess_op", {
      day,
      mediaId,
      guessedTitles,
    });
    return assertSchema(payload, DailyOpGuessViewSchema);
  }

  async skipOp(day: string): Promise<DailyOpGuessView> {
    const payload = await this.transport.call<unknown>("daily_game_skip_op", { day });
    return assertSchema(payload, DailyOpGuessViewSchema);
  }

  async guess(
    day: string,
    mode: DailyMode,
    mediaId: number,
    guessedTitles: string[],
    proxyUrl: string | null = null
  ): Promise<DailyGuessView> {
    const payload = await this.transport.call<unknown>("daily_game_guess", {
      day,
      mode,
      mediaId,
      guessedTitles,
      ...anilistProxyArgs(proxyUrl),
    });
    return assertSchema(payload, DailyGuessViewSchema);
  }

  async skip(
    day: string,
    mode: DailyMode,
    proxyUrl: string | null = null
  ): Promise<DailyGuessView> {
    const payload = await this.transport.call<unknown>("daily_game_skip", {
      day,
      mode,
      ...anilistProxyArgs(proxyUrl),
    });
    return assertSchema(payload, DailyGuessViewSchema);
  }

  async history(day: string, mode: string, limit = 20): Promise<DailyHistoryItem[]> {
    const payload = await this.transport.call<unknown>("daily_game_history", {
      day,
      mode,
      limit,
    });
    return assertSchema(payload, DailyHistorySchema);
  }

  async reset(): Promise<void> {
    await this.transport.call("daily_game_reset");
  }
}

export const dailyApi = new DailyApi();
