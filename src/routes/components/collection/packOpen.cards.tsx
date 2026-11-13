import { useCell } from "@hullperse/hp_utils/react";
import { SkipForward } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { prefetchRemoteImages } from "@/hooks/remoteImage.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { settingsAtoms } from "@/store/settings.store";
import type { OpenedCard } from "@/types/api/cards";

import PackArt from "@/routes/components/collection/packArt.cards";
import Reveal from "@/routes/components/collection/reveal.cards";

const INTRO_MS = 3_200;

type Phase = "intro" | "reveal";

export default function PackOpen({
  cards,
  packKind = "default",
  value = 0,
  onClose,
  introMs = INTRO_MS,
}: {
  cards: readonly OpenedCard[];
  packKind?: string;
  value?: number;
  onClose: () => void;
  introMs?: number;
}) {
  const { t } = useI18n();
  const enableAnimations = useCell(settingsAtoms.enableAnimations);
  const [phase, setPhase] = useState<Phase>(enableAnimations ? "intro" : "reveal");
  const [flipped, setFlipped] = useState<ReadonlySet<number>>(() => new Set());
  const packRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    prefetchRemoteImages([
      ...cards.map((item) => item.imageUrl),
      ...cards.map((item) => item.collectionCoverUrl),
      ...cards.flatMap((item) => item.collage),
    ]);
  }, [cards]);

  useEffect(() => {
    if (!enableAnimations) {
      setPhase("reveal");
      return;
    }
    setPhase("intro");
    const pack = packRef.current;
    if (pack === null || typeof pack.animate !== "function") {
      setPhase("reveal");
      return;
    }
    let cancelled = false;
    const animation = pack.animate(
      [
        { offset: 0, opacity: 0, transform: "translateY(-140%) rotate(-5deg) scale(0.85)" },
        { offset: 0.08, opacity: 1, transform: "translateY(0) rotate(0deg) scale(1)" },
        { offset: 0.16, transform: "translateX(-5px) rotate(-1deg)" },
        { offset: 0.22, transform: "translateX(5px) rotate(1deg)" },
        { offset: 0.28, transform: "translateX(-4px) rotate(-0.5deg)" },
        { offset: 0.34, transform: "translateX(0) rotate(0deg)" },
        { offset: 0.46, transform: "scale(1.03)" },
        { offset: 0.56, transform: "scale(0.98)" },
        { offset: 0.64, opacity: 1, transform: "scale(1.1)" },
        { offset: 0.72, opacity: 0, transform: "scale(1.4)" },
        { offset: 1, opacity: 0, transform: "scale(1.4)" },
      ],
      { duration: introMs, easing: "ease-in-out" }
    );
    animation.finished
      .then(() => {
        if (!cancelled) setPhase("reveal");
        return null;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      animation.cancel();
    };
  }, [enableAnimations, introMs]);

  const flip = (index: number) => {
    setFlipped((current) => {
      if (current.has(index)) return current;
      const next = new Set(current);
      next.add(index);
      return next;
    });
  };

  const skipIntro = () => {
    packRef.current?.getAnimations().forEach((animation) => animation.cancel());
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
  const skipLabel = phase === "intro" ? t("collection.skip") : t("collection.open.revealAll");
  const rows = [cards.slice(0, 4), cards.slice(4)];

  const card = (item: OpenedCard, index: number) => (
    <div className="cards-reveal-card" key={`${item.kind}:${item.entityId}:${index}`}>
      <Reveal card={item} index={index} flipped={flipped.has(index)} onFlip={flip} />
    </div>
  );

  return (
    <Modal
      header={t("collection.open.title")}
      headerActions={
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
          <p className="windows95-text text-hint m-0 text-center">
            {t("collection.open.intro.hint")}
          </p>
        </div>
      )}

      {phase === "reveal" && (
        <div className="flex w-full flex-col gap-3">
          <div className="cards-reveal-stage">
            {rows.map((row, rowIndex) => (
              <div className="cards-reveal-row" data-testid="reveal-row" key={rowIndex}>
                {row.map((item, columnIndex) => card(item, rowIndex * 4 + columnIndex))}
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
