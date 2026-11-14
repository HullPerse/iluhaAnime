import { cn } from "cn";
import { Heart } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";

import ImageComponent from "@/components/ui/image.component";
import { cardKindLabelKeys, cardRarityLabelKeys } from "@/config/cards/labels.config";
import { useCardsImageProxy } from "@/hooks/cards/imageProxy.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { useRemoteImageStatus } from "@/hooks/remoteImage.hook";
import type { CardRarity } from "@/types/api/cards";
import type { CardFaceItem } from "@/types/ui/collection";

import RarityBadge from "@/routes/components/collection/rarityBadge.cards";
import StudioCollage from "@/routes/components/collection/studioCollage.cards";

const RARITY_CLASS: Record<CardRarity, string> = {
  junk: "cards-rarity-junk",
  common: "cards-rarity-common",
  rare: "cards-rarity-rare",
  epic: "cards-rarity-epic",
  legendary: "cards-rarity-legendary",
};

const RARITY_RANK: Record<CardRarity, number> = {
  junk: 0,
  common: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

export default function CardFace({
  card,
  className,
  tilt = "restrained",
  onPointerLeave,
}: {
  card: CardFaceItem;
  className?: string;
  tilt?: "restrained" | "full";
  onPointerLeave?: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  const { t } = useI18n();
  const imageProxy = useCardsImageProxy();
  const title = card.title.trim() === "" ? t("collection.detail.unknown.title") : card.title;
  const remoteImage = card.kind === "studio" ? null : card.imageUrl;
  const { src: cachedImage, failed: imageFailed } = useRemoteImageStatus(remoteImage, imageProxy);
  const imageSrc = cachedImage ?? (imageFailed ? card.imageUrl : null);
  const holoAllowed = card.variant !== "holo" || RARITY_RANK[card.rarity] >= RARITY_RANK.rare;
  const variantClass =
    card.variant === "foil"
      ? "cards-variant-foil"
      : card.variant === "holo" && holoAllowed
        ? "cards-variant-holo"
        : "";

  return (
    <div
      className={cn("cards-window", RARITY_CLASS[card.rarity], className)}
      data-card-face
      data-kind={card.kind}
      data-tilt={tilt}
      onPointerLeave={onPointerLeave}
    >
      <div className="cards-window-bar" title={title}>
        <span>{title}</span>
        {card.isFavorite === true && (
          <div
            className="ml-auto flex shrink-0 items-center"
            title={t("collection.favorite")}
            data-testid="card-favorite"
          >
            <Heart className="size-2.5 fill-red-500 text-white" aria-hidden />
            <span className="sr-only">{t("collection.favorite")}</span>
          </div>
        )}
      </div>
      <div className={cn("cards-inner", variantClass)}>
        <div className="cards-art">
          {card.kind === "studio" ? (
            <StudioCollage title={title} collage={card.collage} />
          ) : remoteImage !== null && imageSrc === null ? (
            <div
              className="bg-surface h-full w-full animate-pulse motion-reduce:animate-none"
              aria-hidden
            />
          ) : (
            <ImageComponent
              src={imageSrc ?? ""}
              alt={title}
              type={card.kind === "anime" || card.kind === "manga" ? "cover" : "contain"}
              className="h-full w-full"
            />
          )}
        </div>
        <div className="cards-meta">
          <span className="cards-kind">{t(cardKindLabelKeys[card.kind])}</span>
          <span
            className="cards-value"
            aria-label={`${t("collection.value")}: ${card.value}`}
            title={`${t("collection.value")}: ${card.value}`}
          >
            <img
              src="/money.png"
              alt=""
              className="chubrik-icon"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
            />
            <span className="cards-value-amount">{card.value}</span>
          </span>
        </div>
        <RarityBadge rarity={card.rarity} />
      </div>
      <span className="sr-only">{t(cardRarityLabelKeys[card.rarity])}</span>
    </div>
  );
}
