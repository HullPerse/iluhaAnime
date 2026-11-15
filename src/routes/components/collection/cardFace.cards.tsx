import { cn } from "cn";
import { useCell } from "@hullperse/hp_utils/react";
import { Heart } from "lucide-react";
import { memo } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import ImageComponent from "@/components/ui/image.component";
import DitherCanvas from "@/components/shared/dither.component";
import { cardKindLabelKeys, cardRarityLabelKeys } from "@/config/cards/labels.config";
import { DITHER_PRESETS } from "@/config/graphics/dither.config";
import { useCardsImageProxy } from "@/hooks/cards/imageProxy.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { useRemoteImageStatus } from "@/hooks/remoteImage.hook";
import { settingsAtoms } from "@/store/settings.store";
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

function CardFace({
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
  const cardImageFill = useCell(settingsAtoms.cardImageFill);
  const ditherPreset =
    card.variant === "cursed" ? DITHER_PRESETS.find((preset) => preset.id === "crt") : undefined;
  const imageFit =
    cardImageFill || card.kind === "anime" || card.kind === "manga" ? "cover" : "contain";
  const imageProxy = useCardsImageProxy();
  const title = card.title.trim() === "" ? t("collection.detail.unknown.title") : card.title;
  const remoteImage = card.kind === "studio" ? null : card.imageUrl;
  const { src: cachedImage, failed: imageFailed } = useRemoteImageStatus(remoteImage, imageProxy);
  const imageSrc = cachedImage ?? (imageFailed ? card.imageUrl : null);
  const holoAllowed = card.variant !== "holo" || RARITY_RANK[card.rarity] >= RARITY_RANK.rare;

  const getVariantClass = () => {
    if (card.variant === "foil") return "cards-variant-foil";
    else if (card.variant === "holo" && holoAllowed) return "cards-variant-holo";
    else if (card.variant === "cursed") return "cards-variant-cursed";
    else return "";
  };

  const variantClass = getVariantClass();

  return (
    <div
      className={cn("cards-window", RARITY_CLASS[card.rarity], className)}
      data-card-face
      data-kind={card.kind}
      data-tilt={tilt}
      onPointerLeave={onPointerLeave}
    >
      <div className="cards-window-bar" title={title}>
        <span className="text-white">{title}</span>
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
            <StudioCollage title={title} collage={card.collage} ditherPreset={ditherPreset} />
          ) : remoteImage !== null && imageSrc === null ? (
            <div
              className="bg-surface h-full w-full animate-pulse motion-reduce:animate-none"
              aria-hidden
            />
          ) : ditherPreset && ditherPreset.id !== "none" && imageSrc ? (
            <DitherCanvas
              src={imageSrc}
              ariaLabel={title}
              className="h-full w-full"
              imageFit={imageFit}
              capToDisplay
              displayScale={0.6}
              scale={ditherPreset.scale}
              {...ditherPreset.options}
            />
          ) : (
            <ImageComponent
              src={imageSrc ?? ""}
              alt={title}
              type={imageFit}
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

export default memo(CardFace);
