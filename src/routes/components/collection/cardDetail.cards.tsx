import { ExternalLink } from "lucide-react";
import { useState } from "react";

import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { anilistApi } from "@/api/anilist.api";
import { animeSourceLabelKeys } from "@/config/cards/labels.config";
import { useAnilistSignedIn } from "@/hooks/anilist/session.hook";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useCardsMutations } from "@/hooks/cards/mutations.hook";
import {
  useCardsCardFavorite,
  useCardsCardVariants,
  useCardsGallery,
} from "@/hooks/cards/queries.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";
import type { CardVariant, CollectionItem } from "@/types/api/cards";
import type { AniListOverlayScreen } from "@/types/anilist/anilistUi";
import type { TranslationKey } from "@/types/core/i18n";

import AniListDetailModal from "@/routes/components/anilist/detail/modal.detail";
import AniListProfileModal from "@/routes/components/anilist/detail/profileModal.detail";
import { FavHeartButton } from "@/routes/components/anilist/detail/favHeartButton.detail";
import CardFacts from "@/routes/components/collection/cardFacts.cards";
import CardPreview from "@/routes/components/collection/cardPreview.cards";
import GiftAction from "@/routes/components/collection/giftAction.cards";
import GiftFlow from "@/routes/components/collection/giftFlow.cards";

function animeIdOf(card: CollectionItem): number | null {
  if (card.kind === "anime") return card.entityId;

  if (card.kind === "character") return card.collectionAnimeId;

  return null;
}

function anilistProfileOf(card: CollectionItem, fallbackName: string): AniListOverlayScreen | null {
  const name = card.title.trim() || fallbackName;

  if (card.kind === "staff") return { kind: "staff", id: card.entityId, name };

  if (card.kind === "studio") {
    return { kind: "studio", id: card.entityId, name, image: card.collage[0] ?? null };
  }

  return null;
}

function pickOwnedCard(
  owned: readonly CollectionItem[],
  pickedVariant: CardVariant,
  item: CollectionItem
): CollectionItem {
  const sameRarity = owned.find(
    (entry) => entry.variant === pickedVariant && entry.rarity === item.rarity
  );

  return sameRarity ?? owned.find((entry) => entry.variant === pickedVariant) ?? item;
}

function sourceLine(
  card: CollectionItem,
  sourceMaterial: string | null,
  translate: (key: TranslationKey) => string
): string {
  if (sourceMaterial !== null) {
    const labelKey = animeSourceLabelKeys[sourceMaterial];

    return labelKey === undefined
      ? sourceMaterial.replaceAll("_", " ").toLowerCase()
      : translate(labelKey);
  }

  return card.collectionTitle?.trim() || translate("collection.detail.no.source");
}

export default function CardDetail({
  item,
  onClose,
}: {
  item: CollectionItem;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const signedIn = useAnilistSignedIn();
  const variants = useCardsCardVariants(item.kind, item.entityId);
  const favorite = useCardsCardFavorite(item.kind, item.entityId);
  const gallery = useCardsGallery(item.kind, item.entityId);
  const { setCardVariant, setCardFavorite, setPreferredImage } = useCardsMutations();
  const [pickedVariant, setPickedVariant] = useState<CardVariant>(item.variant);
  const [openAnimeId, setOpenAnimeId] = useState<number | null>(null);
  const [openProfile, setOpenProfile] = useState<AniListOverlayScreen | null>(null);
  const [giftOpen, setGiftOpen] = useState<boolean>(false);

  const ownedVariants = variants.data ?? [];
  const card = pickOwnedCard(ownedVariants, pickedVariant, item);
  const animeId = animeIdOf(card);
  const anilistProfile = anilistProfileOf(card, t("collection.detail.unknown.title"));
  const animeQuery = useAppQuery("static", {
    queryKey: queryKeys.animeScreen(animeId ?? 0),
    queryFn: () => anilistApi.getAnimeById(animeId ?? 0),
    enabled: card.kind === "anime" && animeId !== null,
  });
  const sourceMaterial = card.kind === "anime" ? (animeQuery.data?.source ?? null) : null;
  const source = sourceLine(card, sourceMaterial, t);
  const isFavorite = favorite.data === true;

  const toggleFavorite = () => {
    setCardFavorite.mutate({
      kind: card.kind,
      entityId: card.entityId,
      favorite: !isFavorite,
    });
  };

  const changeVariant = (next: CardVariant) => {
    setPickedVariant(next);
    setCardVariant.mutate({
      kind: card.kind,
      entityId: card.entityId,
      variant: next,
    });
  };

  if (openAnimeId !== null) {
    return (
      <AniListDetailModal
        animeId={openAnimeId}
        isLoggedIn={signedIn}
        onTag={() => undefined}
        onGenre={() => undefined}
        onBack={() => setOpenAnimeId(null)}
        onClose={() => setOpenAnimeId(null)}
      />
    );
  }

  if (openProfile !== null) {
    return (
      <AniListProfileModal
        key={`${openProfile.kind}-${openProfile.id}`}
        initialScreen={openProfile}
        onOpenAnime={(id) => {
          setOpenProfile(null);
          setOpenAnimeId(id);
        }}
        onClose={() => setOpenProfile(null)}
      />
    );
  }

  if (giftOpen) {
    return <GiftFlow item={card} onBack={() => setGiftOpen(false)} onClose={onClose} />;
  }

  return (
    <Modal
      header={t("collection.detail.title")}
      onClose={onClose}
      headerActions={
        <>
          {animeId !== null && (
            <Button
              size="icon"
              className="size-5"
              aria-label={t("collection.detail.open.anime")}
              title={t("collection.detail.open.anime")}
              onClick={() => setOpenAnimeId(animeId)}
            >
              <ExternalLink className="size-3" />
            </Button>
          )}
          {anilistProfile !== null && (
            <Button
              size="icon"
              className="size-5"
              aria-label={t("collection.detail.open.anilist")}
              title={t("collection.detail.open.anilist")}
              onClick={() => setOpenProfile(anilistProfile)}
            >
              <ExternalLink className="size-3" />
            </Button>
          )}
          <FavHeartButton
            isFavorite={isFavorite}
            loading={favorite.isPending || setCardFavorite.isPending}
            onToggle={toggleFavorite}
          />
          <GiftAction
            key={`${card.kind}-${card.entityId}-${card.rarity}-${card.variant}`}
            onOpen={() => setGiftOpen(true)}
          />
        </>
      }
      className="w-[min(56rem,calc(100vw-1rem))]"
      contentClassName="p-0"
    >
      <div className="cards-detail">
        <div className="cards-detail-left">
          <CardPreview
            key={`${card.kind}-${card.entityId}-${card.variant}`}
            card={card}
            images={gallery.data?.images}
            preferredUrl={gallery.data?.preferredUrl ?? null}
            saving={setPreferredImage.isPending}
            saveFailed={setPreferredImage.isError}
            onSaveImage={(imageUrl) =>
              setPreferredImage.mutate({
                kind: card.kind,
                entityId: card.entityId,
                imageUrl,
              })
            }
          />
        </div>

        <CardFacts
          card={card}
          variants={ownedVariants}
          source={source}
          onVariantChange={changeVariant}
        />
      </div>
    </Modal>
  );
}
