import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { prefetchRemoteImages } from "@/hooks/remoteImage.hook";
import type { CardGalleryImage, CollectionItem } from "@/types/api/cards";

import CardBack from "@/routes/components/collection/cardBack.cards";
import CardFace from "@/routes/components/collection/cardFace.cards";
import CardSpin from "@/routes/components/collection/cardSpin.cards";

export default function CardPreview({
  card,
  images,
  preferredUrl,
  saving,
  saveFailed,
  onSaveImage,
}: {
  card: CollectionItem;
  images: CardGalleryImage[] | undefined;
  preferredUrl: string | null;
  saving: boolean;
  saveFailed: boolean;
  onSaveImage: (imageUrl: string) => void;
}) {
  const { t } = useI18n();
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const galleryImages = useMemo(() => images ?? [], [images]);
  const savedImageUrl = preferredUrl ?? card.imageUrl;
  const slides = useMemo(() => {
    if (galleryImages.length === 0) return [];
    if (savedImageUrl && !galleryImages.some((image) => image.url === savedImageUrl)) {
      return [{ url: savedImageUrl, thumbUrl: savedImageUrl }, ...galleryImages];
    }
    return galleryImages;
  }, [galleryImages, savedImageUrl]);
  const savedIndex = Math.max(
    0,
    slides.findIndex((image) => image.url === savedImageUrl)
  );
  const activeIndex =
    slides.length === 0 ? 0 : Math.min(previewIndex ?? savedIndex, slides.length - 1);
  const currentImageUrl = slides[activeIndex]?.url ?? card.imageUrl;
  const previewCard =
    currentImageUrl === card.imageUrl ? card : { ...card, imageUrl: currentImageUrl };
  const artChanged = currentImageUrl != null && currentImageUrl !== savedImageUrl;
  const canCancel = artChanged && savedImageUrl !== null;
  const canSave = artChanged && galleryImages.some((image) => image.url === currentImageUrl);

  useEffect(() => {
    if (slides.length < 2) return;
    const neighbors = [
      slides[activeIndex]?.url,
      slides[activeIndex - 1]?.url,
      slides[activeIndex + 1]?.url,
    ].filter((url): url is string => url !== undefined);
    prefetchRemoteImages(neighbors).catch(() => undefined);
  }, [activeIndex, slides]);

  return (
    <>
      <CardSpin
        front={<CardFace card={previewCard} tilt="restrained" />}
        back={<CardBack rarity={card.rarity} />}
      />

      {slides.length > 1 && (
        <div className="cards-detail-gallery">
          <Button
            size="icon"
            variant="outline"
            className="size-6"
            aria-label={t("collection.detail.gallery.prev")}
            title={t("collection.detail.gallery.prev")}
            disabled={activeIndex === 0}
            onClick={() => setPreviewIndex(activeIndex - 1)}
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <span className="cards-detail-gallery-counter" aria-live="polite">
            {activeIndex + 1} / {slides.length}
          </span>
          <Button
            size="icon"
            variant="outline"
            className="size-6"
            aria-label={t("collection.detail.gallery.next")}
            title={t("collection.detail.gallery.next")}
            disabled={activeIndex === slides.length - 1}
            onClick={() => setPreviewIndex(activeIndex + 1)}
          >
            <ChevronRight className="size-3.5" />
          </Button>
          <div className="cards-detail-gallery-actions">
            <Button
              size="icon"
              variant="outline"
              className="size-6"
              aria-label={t("collection.detail.gallery.apply")}
              title={t("collection.detail.gallery.apply")}
              disabled={!canSave || saving}
              onClick={() => {
                if (!currentImageUrl) return;
                onSaveImage(currentImageUrl);
              }}
            >
              <Check className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="size-6"
              aria-label={t("collection.detail.gallery.cancel")}
              title={t("collection.detail.gallery.cancel")}
              disabled={!canCancel}
              onClick={() => setPreviewIndex(savedIndex)}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
      {saveFailed && (
        <span className="cards-detail-gallery-error">{t("collection.detail.gallery.error")}</span>
      )}
    </>
  );
}
