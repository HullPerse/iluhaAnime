import { useCell } from "@hullperse/hp_utils/react";
import { SkipForward } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { PACK_INTRO_MS } from "@/config/cards/pack.config";
import { usePackIntroAnimation } from "@/hooks/cards/packIntro.hook";
import { packImageUrls } from "@/lib/cards/pack.utils";
import { useCardsImageProxy } from "@/hooks/cards/imageProxy.hook";
import { useCardTilt } from "@/hooks/cards/tilt.hook";
import {
  cancelRemoteImageQueue,
  prefetchRemoteImages,
  setRemoteImageScope,
} from "@/hooks/remoteImage.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { settingsAtoms } from "@/store/settings.store";
import type { OpenedCard } from "@/types/api/cards";
import type { PackOpeningPhase } from "@/types/ui/collection";

import PackArt from "@/routes/components/collection/packArt.cards";
import Reveal from "@/routes/components/collection/reveal.cards";

export default function PackOpen({
  cards,
  packKind = "default",
  value = 0,
  onClose,
  introMs = PACK_INTRO_MS,
  chosenSlot = null,
  claiming = false,
  choiceError = false,
  onChoose,
}: {
  cards: readonly OpenedCard[];
  packKind?: string;
  value?: number;
  onClose: () => void;
  introMs?: number;
  /** Choice packs: the picked slot, once the player has claimed a card. */
  chosenSlot?: number | null;
  claiming?: boolean;
  choiceError?: boolean;
  onChoose?: (slot: number) => void;
}) {
  const { t } = useI18n();
  const imageProxy = useCardsImageProxy();
  const enableAnimations = useCell(settingsAtoms.enableAnimations);
  const tilt = useCardTilt(enableAnimations);
  const [phase, setPhase] = useState<PackOpeningPhase>("intro");
  const [introFinished, setIntroFinished] = useState<boolean>(false);
  const [imagesReady, setImagesReady] = useState<boolean>(false);
  const [flipped, setFlipped] = useState<ReadonlySet<number>>(() => new Set());
  const [pendingChoice, setPendingChoice] = useState<number | null>(null);
  const choiceInFlight = useRef<boolean>(false);
  const packRef = useRef<HTMLButtonElement>(null);
  const images = useMemo(() => packImageUrls(cards), [cards]);

  useEffect(() => {
    setImagesReady(false);
    setRemoteImageScope(images);
    let cancelled = false;
    prefetchRemoteImages(images, imageProxy)
      .then(() => {
        if (!cancelled) setImagesReady(true);

        return null;
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      setRemoteImageScope(null);
      cancelRemoteImageQueue();
    };
  }, [imageProxy, images]);

  usePackIntroAnimation(enableAnimations, introMs, packRef, setIntroFinished);

  useEffect(() => {
    if (phase === "intro" && introFinished && imagesReady) setPhase("reveal");
  }, [phase, introFinished, imagesReady]);

  useEffect(() => {
    if (chosenSlot !== null) {
      setFlipped(new Set(cards.map((_, index) => index)));
    }
  }, [cards, chosenSlot]);

  useEffect(() => {
    if (!choiceError) return;
    choiceInFlight.current = false;
    setPendingChoice(null);
  }, [choiceError]);

  const flip = (index: number) => {
    if (choosing && chosenSlot === null) {
      if (claiming || choiceInFlight.current) return;
      choiceInFlight.current = true;
      setFlipped(new Set(cards.map((_, cardIndex) => cardIndex)));
      setPendingChoice(index);
      onChoose?.(index);

      return;
    }

    setFlipped((current) => {
      if (current.has(index)) return current;
      const next = new Set(current);
      next.add(index);

      return next;
    });
  };

  const skipIntro = () => {
    packRef.current?.getAnimations?.().forEach((animation) => animation.cancel());
    setIntroFinished(true);
    setPhase("reveal");
  };

  const skip = () => {
    if (phase === "intro") {
      skipIntro();

      return;
    }

    setFlipped(new Set(cards.map((_, index) => index)));
  };

  const allFlipped = cards.length > 0 && flipped.size === cards.length;
  const choosing = onChoose !== undefined;
  const activeChoice = chosenSlot ?? (choiceError ? null : pendingChoice);
  const skipLabel = phase === "intro" ? t("collection.skip") : t("collection.open.revealAll");
  const rows = [cards.slice(0, 4), cards.slice(4)].filter((row) => row.length > 0);

  const card = (item: OpenedCard, index: number, sourcePlacement: "above" | "below") => {
    const discarded = activeChoice !== null && activeChoice !== index;
    const picked = activeChoice === index;

    return (
      <div
        className="cards-reveal-card"
        key={`${item.kind}:${item.entityId}:${index}`}
        data-choice={choosing ? "true" : undefined}
        data-discarded={discarded ? "true" : undefined}
        data-picked={picked ? "true" : undefined}
      >
        <Reveal
          card={item}
          index={index}
          flipped={flipped.has(index)}
          onFlip={flip}
          sourcePlacement={sourcePlacement}
        />
      </div>
    );
  };

  return (
    <Modal
      header={t("collection.open.title")}
      headerActions={
        choosing ? undefined : (
          <Button
            size="icon"
            className="size-5"
            aria-label={skipLabel}
            title={skipLabel}
            disabled={phase === "reveal" && allFlipped}
            onClick={skip}
          >
            <SkipForward className="size-3" />
          </Button>
        )
      }
      onClose={onClose}
      className="w-[min(76rem,calc(100vw-1rem))]"
      style={{ maxHeight: "calc(100% - 1rem)" }}
      contentClassName="gap-3"
    >
      {phase === "intro" && (
        <div className="flex min-h-96 flex-col items-center justify-center gap-4 p-4">
          <button
            ref={packRef}
            type="button"
            className="cards-pack-intro border-0 bg-transparent p-0"
            aria-label={t("collection.open.intro")}
            data-testid="pack-intro"
            onClick={skipIntro}
          >
            <PackArt packKind={packKind} size={cards.length} />
          </button>
        </div>
      )}

      {phase === "reveal" && (
        <div className="flex w-full flex-col gap-3">
          <div className="cards-reveal-stage" {...tilt}>
            {rows.map((row, rowIndex) => (
              <div className="cards-reveal-row" data-testid="reveal-row" key={rowIndex}>
                {row.map((item, columnIndex) =>
                  card(
                    item,
                    rowIndex * 4 + columnIndex,
                    rowIndex < rows.length - 1 ? "below" : "above"
                  )
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="windows95-text flex items-center gap-1 font-bold" aria-live="polite">
              {allFlipped && value > 0 && (
                <>
                  <img src="/money.png" alt="" className="chubrik-icon" />
                  <span className="tabular-nums">+{value}</span>
                </>
              )}

              {choosing && choiceError && (
                <span className="text-destructive font-normal" role="alert">
                  {t("collection.open.choice.error")}
                </span>
              )}
            </span>
            <Button className="h-6 px-2 text-xs" disabled={!allFlipped} onClick={onClose}>
              {t("collection.open.done")}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
