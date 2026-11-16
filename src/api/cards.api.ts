import * as z from "zod/mini";

import { assertSchema } from "@/lib/core/system/invoke.utils";
import {
  AnimeCollectionPageSchema,
  CardFavoriteSchema,
  CardGallerySchema,
  CardVariantsSchema,
  CardsBootstrapSchema,
  CardsShellSchema,
  CardsUnreadSchema,
  CollectionRosterPageSchema,
  CardPackListSchema,
  CreatedGiftSchema,
  GiftCardsSchema,
  GiftDeleteResultSchema,
  GiftItemSchema,
  GiftListSchema,
  CardsStatsSchema,
  CollectionPageSchema,
  CollectionShelfSchema,
  DustResultSchema,
  GrantResultSchema,
  StarterStatusSchema,
  PackOpeningSchema,
  PackPreparationSchema,
  PurchaseResultSchema,
  ResetCollectionSchema,
  SetCardVariantSchema,
} from "@/schemas/cards.schema";
import type {
  AnimeCollectionPage,
  CardGallery,
  CardGiftClaimInput,
  CardPackRow,
  CardsApiConfig,
  CardsBootstrap,
  CardsCollectionParams,
  CardsShell,
  CardsStats,
  CollectionItem,
  CardsUnread,
  CollectionShelfSort,
  CollectionPage,
  CollectionRosterPage,
  CollectionShelfItem,
  CreateGiftInput,
  CreatedGift,
  DustCardInput,
  GiftCard,
  GiftDeleteResult,
  GiftItem,
  DustResult,
  GrantResult,
  PackOpening,
  StarterStatus,
  PackPreparation,
  PurchaseResult,
} from "@/types/api/cards";
import type { ApiTransport } from "@/types/core/transport";
import { createCardsClient } from "@/types/core/ipc.generated";
import type { CardsClient } from "@/types/core/ipc.generated";
import { tauriTransport } from "@/api/transport.api";

export class CardsApi {
  private readonly transport: ApiTransport;
  private readonly cardsClient: CardsClient;

  constructor(config: CardsApiConfig = {}) {
    this.transport = config.transport ?? tauriTransport;
    this.cardsClient = createCardsClient((command, args) => this.call(command, args));
  }

  private call<T>(command: string, args?: Record<string, unknown>): Promise<Awaited<T>> {
    return this.transport.call<T>(command, args);
  }

  async bootstrap(): Promise<CardsBootstrap> {
    return assertSchema(await this.cardsClient.cardsBootstrap(), CardsBootstrapSchema);
  }

  async shell(packsSince: number, cardsSince: number): Promise<CardsShell> {
    return assertSchema(
      await this.cardsClient.cardsShell({ packsSince, cardsSince }),
      CardsShellSchema
    );
  }

  async packs(): Promise<CardPackRow[]> {
    return assertSchema(await this.cardsClient.cardsPacks(), CardPackListSchema);
  }

  async preparePacks(proxy: string | null = null): Promise<PackPreparation> {
    return assertSchema(
      await this.cardsClient.cardsPreparePacks({ proxyUrl: proxy }),
      PackPreparationSchema
    );
  }

  async acknowledgePreparedPacks(): Promise<number> {
    return assertSchema(await this.cardsClient.cardsAckPreparedPacks(), z.number());
  }

  async openPack(packId: string, proxy: string | null = null): Promise<PackOpening> {
    return assertSchema(
      await this.cardsClient.cardsOpenPack({ packId, proxyUrl: proxy }),
      PackOpeningSchema
    );
  }

  async collection(
    params: CardsCollectionParams = {},
    proxy: string | null = null
  ): Promise<CollectionPage> {
    return assertSchema(
      await this.cardsClient.cardsCollection({
        kind: params.kind ?? null,
        rarity: params.rarity ?? null,
        variant: params.variant ?? null,
        sort: params.sort ?? null,
        sortDir: params.sortDir ?? null,
        query: params.query ?? null,
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 24,
        proxyUrl: proxy,
      }),
      CollectionPageSchema
    );
  }

  async resetCollection(): Promise<number> {
    return assertSchema(await this.cardsClient.cardsResetCollection(), ResetCollectionSchema);
  }

  async collections(
    sort: CollectionShelfSort = "recent",
    sortDir: CardsCollectionParams["sortDir"] = "desc",
    proxy: string | null = null
  ): Promise<CollectionShelfItem[]> {
    return assertSchema(
      await this.cardsClient.cardsCollections({ sort, sortDir, proxyUrl: proxy }),
      CollectionShelfSchema
    );
  }

  async cardVariants(kind: CollectionItem["kind"], entityId: number): Promise<CollectionItem[]> {
    return assertSchema(
      await this.cardsClient.cardsCardVariants({ kind, entityId }),
      CardVariantsSchema
    );
  }

  async gallery(
    kind: CollectionItem["kind"],
    entityId: number,
    proxy: string | null = null
  ): Promise<CardGallery> {
    return assertSchema(
      await this.cardsClient.cardsGallery({ kind, entityId, proxyUrl: proxy }),
      CardGallerySchema
    );
  }

  async setPreferredImage(
    kind: CollectionItem["kind"],
    entityId: number,
    imageUrl: string | null
  ): Promise<number> {
    return assertSchema(
      await this.cardsClient.cardsSetPreferredImage({ kind, entityId, imageUrl }),
      z.number()
    );
  }

  async setCardVariant(
    kind: CollectionItem["kind"],
    entityId: number,
    variant: CollectionItem["variant"]
  ): Promise<number> {
    return assertSchema(
      await this.cardsClient.cardsSetCardVariant({ kind, entityId, variant }),
      SetCardVariantSchema
    );
  }

  async isCardFavorite(kind: CollectionItem["kind"], entityId: number): Promise<boolean> {
    return assertSchema(
      await this.cardsClient.cardsCardFavorite({ kind, entityId }),
      CardFavoriteSchema
    );
  }

  async setCardFavorite(
    kind: CollectionItem["kind"],
    entityId: number,
    favorite: boolean
  ): Promise<boolean> {
    return assertSchema(
      await this.cardsClient.cardsSetCardFavorite({ kind, entityId, favorite }),
      CardFavoriteSchema
    );
  }

  async animeCollection(
    animeId: number,
    kind: "anime" | "manga" = "anime",
    proxy: string | null = null
  ): Promise<AnimeCollectionPage> {
    return assertSchema(
      await this.cardsClient.cardsAnimeCollection({ animeId, kind, proxyUrl: proxy }),
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
      await this.cardsClient.cardsCollectionRoster({
        mediaId,
        kind,
        page,
        proxyUrl: proxy,
      }),
      CollectionRosterPageSchema
    );
  }

  async unread(packsSince: number, cardsSince: number): Promise<CardsUnread> {
    return assertSchema(
      await this.cardsClient.cardsUnread({ packsSince, cardsSince }),
      CardsUnreadSchema
    );
  }

  async stats(): Promise<CardsStats> {
    return assertSchema(await this.cardsClient.cardsStats(), CardsStatsSchema);
  }

  async dust(input: DustCardInput): Promise<DustResult> {
    return assertSchema(await this.cardsClient.cardsDust(input), DustResultSchema);
  }

  async buyPack(packKind: string): Promise<PurchaseResult> {
    return assertSchema(await this.cardsClient.cardsBuyPack({ packKind }), PurchaseResultSchema);
  }

  async starterStatus(proxy: string | null = null): Promise<StarterStatus> {
    return assertSchema(
      await this.cardsClient.cardsStarterStatus({ proxyUrl: proxy }),
      StarterStatusSchema
    );
  }

  async grantStarter(userId: number, proxy: string | null = null): Promise<GrantResult> {
    return assertSchema(
      await this.cardsClient.cardsGrantStarter({ userId, proxyUrl: proxy }),
      GrantResultSchema
    );
  }

  async createGift(input: CreateGiftInput): Promise<CreatedGift> {
    return assertSchema(await this.cardsClient.cardsCreateGift(input), CreatedGiftSchema);
  }

  async claimGift(input: CardGiftClaimInput): Promise<GiftCard[]> {
    return assertSchema(await this.cardsClient.cardsClaimGift(input), GiftCardsSchema);
  }

  async gifts(): Promise<GiftItem[]> {
    return assertSchema(await this.cardsClient.cardsGifts(), GiftListSchema);
  }

  async markGiftClaimed(giftId: string): Promise<GiftItem> {
    return assertSchema(await this.cardsClient.cardsMarkGiftClaimed({ giftId }), GiftItemSchema);
  }

  async deleteGift(giftId: string): Promise<GiftDeleteResult> {
    return assertSchema(await this.cardsClient.cardsDeleteGift({ giftId }), GiftDeleteResultSchema);
  }
}

export const cardsApi = new CardsApi();
