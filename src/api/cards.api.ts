import * as z from "zod/mini";

import { anilistProxyArgs } from "@/lib/anilist/anilistProxy.utils";
import { assertSchema } from "@/lib/core/system/invoke.utils";
import {
  AnimeCollectionPageSchema,
  CardVariantsSchema,
  CardsBootstrapSchema,
  CardsUnreadSchema,
  CollectionRosterPageSchema,
  CardPackListSchema,
  CardPackSchema,
  CreatedGiftSchema,
  CardsStatsSchema,
  CollectionPageSchema,
  CollectionShelfSchema,
  DustResultSchema,
  GrantResultSchema,
  OpenedCardSchema,
  PackOpeningSchema,
  PackPreparationSchema,
  PurchaseResultSchema,
  ResetCollectionSchema,
  SetCardVariantSchema,
} from "@/api/cards.schema";
import type {
  AnimeCollectionPage,
  CardPackRow,
  CardsApiConfig,
  CardsBootstrap,
  CardsCollectionParams,
  CardsStats,
  CollectionItem,
  CardsUnread,
  CollectionShelfSort,
  CollectionPage,
  CollectionRosterPage,
  CollectionShelfItem,
  CreatedGift,
  DustCardInput,
  DustResult,
  GrantResult,
  OpenedCard,
  PackOpening,
  PackPreparation,
  PurchaseResult,
} from "@/types/api/cards";
import type { ApiTransport } from "@/types/core/transport";
import { tauriTransport } from "@/api/transport.api";

export class CardsApi {
  private readonly transport: ApiTransport;

  constructor(config: CardsApiConfig = {}) {
    this.transport = config.transport ?? tauriTransport;
  }

  private call<T>(command: string, args?: Record<string, unknown>): Promise<Awaited<T>> {
    return this.transport.call<T>(command, args);
  }

  async bootstrap(): Promise<CardsBootstrap> {
    return assertSchema(await this.call("cards_bootstrap"), CardsBootstrapSchema);
  }

  async packs(): Promise<CardPackRow[]> {
    return assertSchema(await this.call("cards_packs"), CardPackListSchema);
  }

  async grantTestPack(): Promise<CardPackRow> {
    return assertSchema(await this.call("cards_grant_test_pack"), CardPackSchema);
  }

  async grantTestLegendaryPack(): Promise<CardPackRow> {
    return assertSchema(
      await this.call("cards_grant_test_legendary_pack"),
      CardPackSchema
    );
  }

  async grantTestEffectsPack(): Promise<CardPackRow> {
    return assertSchema(await this.call("cards_grant_test_effects_pack"), CardPackSchema);
  }

  async preparePacks(proxy: string | null = null): Promise<PackPreparation> {
    return assertSchema(
      await this.call("cards_prepare_packs", anilistProxyArgs(proxy)),
      PackPreparationSchema
    );
  }

  async acknowledgePreparedPacks(): Promise<number> {
    return assertSchema(await this.call("cards_ack_prepared_packs"), z.number());
  }

  async openPack(packId: string, proxy: string | null = null): Promise<PackOpening> {
    return assertSchema(
      await this.call("cards_open_pack", { packId, ...anilistProxyArgs(proxy) }),
      PackOpeningSchema
    );
  }

  async collection(
    params: CardsCollectionParams = {},
    proxy: string | null = null
  ): Promise<CollectionPage> {
    return assertSchema(
      await this.call("cards_collection", {
        kind: params.kind ?? null,
        rarity: params.rarity ?? null,
        variant: params.variant ?? null,
        sort: params.sort ?? null,
        sortDir: params.sortDir ?? null,
        query: params.query ?? null,
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 24,
        ...anilistProxyArgs(proxy),
      }),
      CollectionPageSchema
    );
  }

  async resetCollection(): Promise<number> {
    return assertSchema(await this.call("cards_reset_collection"), ResetCollectionSchema);
  }

  async collections(
    sort: CollectionShelfSort = "recent",
    sortDir: CardsCollectionParams["sortDir"] = "desc",
    proxy: string | null = null
  ): Promise<CollectionShelfItem[]> {
    return assertSchema(
      await this.call("cards_collections", {
        sort,
        sortDir,
        ...anilistProxyArgs(proxy),
      }),
      CollectionShelfSchema
    );
  }

  async cardVariants(kind: CollectionItem["kind"], entityId: number): Promise<CollectionItem[]> {
    return assertSchema(
      await this.call("cards_card_variants", { kind, entityId }),
      CardVariantsSchema
    );
  }

  async setCardVariant(
    kind: CollectionItem["kind"],
    entityId: number,
    variant: CollectionItem["variant"]
  ): Promise<number> {
    return assertSchema(
      await this.call("cards_set_card_variant", { kind, entityId, variant }),
      SetCardVariantSchema
    );
  }

  async animeCollection(
    animeId: number,
    kind: "anime" | "manga" = "anime",
    proxy: string | null = null
  ): Promise<AnimeCollectionPage> {
    return assertSchema(
      await this.call("cards_anime_collection", {
        animeId,
        kind,
        ...anilistProxyArgs(proxy),
      }),
      AnimeCollectionPageSchema
    );
  }

  async collectionRoster(
    mediaId: number,
    kind: "anime" | "manga",
    page: number,
    proxy: string | null = null
  ): Promise<CollectionRosterPage> {
    return assertSchema(
      await this.call("cards_collection_roster", {
        mediaId,
        kind,
        page,
        ...anilistProxyArgs(proxy),
      }),
      CollectionRosterPageSchema
    );
  }

  async unread(packsSince: number, cardsSince: number): Promise<CardsUnread> {
    return assertSchema(
      await this.call("cards_unread", { packsSince, cardsSince }),
      CardsUnreadSchema
    );
  }

  async stats(): Promise<CardsStats> {
    return assertSchema(await this.call("cards_stats"), CardsStatsSchema);
  }

  async dust(input: DustCardInput): Promise<DustResult> {
    return assertSchema(
      await this.call("cards_dust", {
        kind: input.kind,
        entityId: input.entityId,
        rarity: input.rarity,
        variant: input.variant,
      }),
      DustResultSchema
    );
  }

  async buyPack(packKind: string): Promise<PurchaseResult> {
    return assertSchema(
      await this.call("cards_buy_pack", { packKind }),
      PurchaseResultSchema
    );
  }

  async grantStarter(userId: number, proxy: string | null = null): Promise<GrantResult> {
    return assertSchema(
      await this.call("cards_grant_starter", {
        userId,
        ...anilistProxyArgs(proxy),
      }),
      GrantResultSchema
    );
  }

  async createGift(input: DustCardInput): Promise<CreatedGift> {
    return assertSchema(
      await this.call("cards_create_gift", {
        kind: input.kind,
        entityId: input.entityId,
        rarity: input.rarity,
        variant: input.variant,
      }),
      CreatedGiftSchema
    );
  }

  async claimGift(giftId: string): Promise<OpenedCard> {
    return assertSchema(
      await this.call("cards_claim_gift", { giftId }),
      OpenedCardSchema
    );
  }
}

export const cardsApi = new CardsApi();
