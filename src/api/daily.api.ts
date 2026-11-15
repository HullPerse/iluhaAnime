import { assertSchema } from "@/lib/core/system/invoke.utils";
import {
  DailyBootstrapSchema,
  DailyFramesViewSchema,
  DailyGuessViewSchema,
  DailyHistorySchema,
  DailyOpGuessViewSchema,
  DailyOpViewSchema,
  DailySearchIndexSchema,
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
  DailySearchEntry,
} from "@/types/api/daily";
import type { ApiTransport } from "@/types/core/transport";
import { createDailyClient } from "@/types/core/ipc.generated";
import type { DailyClient } from "@/types/core/ipc.generated";

export class DailyApi {
  private readonly dailyClient: DailyClient;

  constructor(transport: ApiTransport = tauriTransport) {
    this.dailyClient = createDailyClient((command, args) => transport.call(command, args));
  }

  async bootstrap(day: string): Promise<DailyBootstrap> {
    return assertSchema(await this.dailyClient.bootstrap({ day }), DailyBootstrapSchema);
  }

  async searchIndex(): Promise<DailySearchEntry[]> {
    return assertSchema(await this.dailyClient.searchIndex(), DailySearchIndexSchema);
  }

  async prepare(
    day: string,
    mode: DailyMode,
    proxyUrl: string | null = null
  ): Promise<DailyFramesView> {
    return assertSchema(
      await this.dailyClient.prepare({ day, mode, proxyUrl }),
      DailyFramesViewSchema
    );
  }

  async revealFrames(day: string, proxyUrl: string | null = null): Promise<DailyFramesView> {
    return assertSchema(
      await this.dailyClient.revealFrames({ day, proxyUrl }),
      DailyFramesViewSchema
    );
  }

  async prepareOp(day: string, proxyUrl: string | null = null): Promise<DailyOpView> {
    return assertSchema(await this.dailyClient.prepareOp({ day, proxyUrl }), DailyOpViewSchema);
  }

  async prepareAudio(day: string, proxyUrl: string | null = null): Promise<DailyOpView> {
    return assertSchema(await this.dailyClient.prepareAudio({ day, proxyUrl }), DailyOpViewSchema);
  }

  async guessAudio(
    day: string,
    mediaId: number,
    guessedTitles: string[]
  ): Promise<DailyOpGuessView> {
    return assertSchema(
      await this.dailyClient.guessAudio({ day, mediaId, guessedTitles }),
      DailyOpGuessViewSchema
    );
  }

  async skipAudio(day: string): Promise<DailyOpGuessView> {
    return assertSchema(await this.dailyClient.skipAudio({ day }), DailyOpGuessViewSchema);
  }

  async guessOp(day: string, mediaId: number, guessedTitles: string[]): Promise<DailyOpGuessView> {
    return assertSchema(
      await this.dailyClient.guessOp({ day, mediaId, guessedTitles }),
      DailyOpGuessViewSchema
    );
  }

  async skipOp(day: string): Promise<DailyOpGuessView> {
    return assertSchema(await this.dailyClient.skipOp({ day }), DailyOpGuessViewSchema);
  }

  async guess(
    day: string,
    mode: DailyMode,
    mediaId: number,
    guessedTitles: string[],
    proxyUrl: string | null = null
  ): Promise<DailyGuessView> {
    return assertSchema(
      await this.dailyClient.guess({ day, mode, mediaId, guessedTitles, proxyUrl }),
      DailyGuessViewSchema
    );
  }

  async skip(
    day: string,
    mode: DailyMode,
    proxyUrl: string | null = null
  ): Promise<DailyGuessView> {
    return assertSchema(await this.dailyClient.skip({ day, mode, proxyUrl }), DailyGuessViewSchema);
  }

  async history(day: string, mode: string, limit = 20): Promise<DailyHistoryItem[]> {
    return assertSchema(await this.dailyClient.history({ day, mode, limit }), DailyHistorySchema);
  }

  async reset(): Promise<void> {
    await this.dailyClient.reset();
  }
}

export const dailyApi = new DailyApi();
