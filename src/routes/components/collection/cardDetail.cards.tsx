import { useState } from "react";

import Modal from "@/components/shared/modal.component";
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

import AniListDetailModal from "@/routes/components/anilist/detail/modal.detail";
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
  const [giftOpen, setGiftOpen] = useState<boolean>(false);

  const ownedVariants = variants.data ?? [];
  const card = ownedVariants.find((entry) => entry.variant === pickedVariant) ?? item;
  const animeId = animeIdOf(card);
  // Anime cards carry no collection title, so their source line asks AniList
  // for the adaptation source (original, manga, light novel, ...).
  const animeQuery = useAppQuery("static", {
    queryKey: queryKeys.animeScreen(animeId ?? 0),
    queryFn: () => anilistApi.getAnimeById(animeId ?? 0),
    enabled: card.kind === "anime" && animeId !== null,
  });
  const sourceMaterial = card.kind === "anime" ? (animeQuery.data?.source ?? null) : null;
  const sourceLabelKey = sourceMaterial === null ? undefined : animeSourceLabelKeys[sourceMaterial];
  const source =
    sourceLabelKey !== undefined
      ? t(sourceLabelKey)
      : sourceMaterial !== null
        ? sourceMaterial.replaceAll("_", " ").toLowerCase()
        : card.collectionTitle?.trim() || t("collection.detail.no.source");
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

  if (giftOpen) {
    return <GiftFlow item={card} onBack={() => setGiftOpen(false)} onClose={onClose} />;
  }

  return (
    <Modal
      header={t("collection.detail.title")}
      onClose={onClose}
      headerActions={
        <>
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
          animeId={animeId}
          onOpenAnime={setOpenAnimeId}
          onVariantChange={changeVariant}
        />
      </div>
    </Modal>
  );
}
