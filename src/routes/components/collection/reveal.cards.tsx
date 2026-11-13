import { useState } from "react";

import { useI18n } from "@/hooks/i18n.hook";
import { useRemoteImageStatus } from "@/hooks/remoteImage.hook";
import type { OpenedCard } from "@/types/api/cards";

import CardBack from "@/routes/components/collection/cardBack.cards";
import CardFace from "@/routes/components/collection/cardFace.cards";

export default function Reveal({
  card,
  index,
  flipped,
  onFlip,
}: {
  card: OpenedCard;
  index: number;
  flipped: boolean;
  onFlip: (index: number) => void;
}) {
  const { t } = useI18n();
  // The reveal keeps the cards still: seven tilted, animated finishes on one
  // screen made the flip and the intro noticeably janky. Same static face as
  // the album, only the click flip moves.
  const [hoverReady, setHoverReady] = useState(false);

  const title =
    card.title.trim() === "" ? t("collection.detail.unknown.title") : card.title;
  const sourceTitle = card.collectionTitle?.trim() ?? "";
  const hasSource = flipped && card.kind === "character" && sourceTitle !== "";
  const sourceCover = useRemoteImageStatus(
    card.kind === "character" ? card.collectionCoverUrl : null
  );
  const sourceCoverSrc =
    sourceCover.src ?? (sourceCover.failed ? card.collectionCoverUrl : null);
  const sourceLabel =
    card.collectionAnimeId === null
      ? t("collection.reveal.source.manga")
      : t("collection.reveal.source");

  return (
    <button
      type="button"
      className="cards-flip"
      data-flipped={flipped}
      data-hover-ready={hoverReady}
      data-testid={`card-flip-${index}`}
      aria-label={`${t("collection.reveal.card")}: ${title}`}
      aria-pressed={flipped}
      onClick={() => onFlip(index)}
      onPointerMove={() => {
        if (flipped) setHoverReady(true);
      }}
      onPointerLeave={() => setHoverReady(false)}
    >
      <div className="cards-flip-inner">
        <div className="cards-face-front" aria-hidden={!flipped}>
          <CardFace card={card} />
        </div>
        <div className="cards-face-back" aria-hidden={flipped}>
          <CardBack rarity={card.rarity} />
        </div>
      </div>
      {hasSource && (
        <span className="cards-reveal-source" data-testid="card-source">
          <span className="cards-reveal-source-cover">
            {sourceCoverSrc !== null && sourceCoverSrc !== "" && (
              <img src={sourceCoverSrc} alt="" loading="eager" referrerPolicy="no-referrer" />
            )}
          </span>
          <span className="cards-reveal-source-copy">
            <span className="cards-reveal-source-label">{sourceLabel}</span>
            <strong className="cards-reveal-source-title">{sourceTitle}</strong>
          </span>
        </span>
      )}
    </button>
  );
}
