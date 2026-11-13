import { useCell } from "@hullperse/hp_utils/react";
import { useRef, useState } from "react";
import type { DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from "react";

import Modal from "@/components/shared/modal.component";
import Select from "@/components/ui/select.component";
import { anilistApi } from "@/api/anilist.api";
import {
  animeSourceLabelKeys,
  cardKindLabelKeys,
  cardRarityLabelKeys,
  cardVariantLabelKeys,
} from "@/config/cards/labels.config";
import { useAnilistSignedIn } from "@/hooks/anilist/session.hook";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useCardsMutations } from "@/hooks/cards/mutations.hook";
import { useCardsCardVariants } from "@/hooks/cards/queries.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { formatCardDate, formatCardRelativeDate } from "@/lib/cards/format.utils";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";
import { settingsAtoms } from "@/store/settings.store";
import type { CardVariant, CollectionItem } from "@/types/api/cards";

import AniListDetailModal from "@/routes/components/anilist/detail/modal.detail";
import CardBack from "@/routes/components/collection/cardBack.cards";
import CardFace from "@/routes/components/collection/cardFace.cards";
import GiftAction from "@/routes/components/collection/giftAction.cards";

/// Degrees of rotation per dragged pixel.
const SPIN_SENSITIVITY = 0.5;
/// Half the front is still readable, so the vertical spin stops short of upside down.
const SPIN_LIMIT_X = 82;
/// Hover tilt, matching the previous "full" tilt the face used to do on its own.
const HOVER_TILT_X = 8;
const HOVER_TILT_Y = 12;

interface DragState {
  pointerId: number;
  x: number;
  y: number;
  rotateX: number;
  rotateY: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/// The shortest signed angle, so releasing a spun card settles back the short way.
function normalizeAngle(degrees: number): number {
  const wrapped = degrees % 360;
  if (wrapped > 180) return wrapped - 360;
  if (wrapped < -180) return wrapped + 360;
  return wrapped;
}

function CardDate({ timestamp }: { timestamp: number }) {
  const { locale } = useI18n();
  const relative = formatCardRelativeDate(timestamp, locale);
  const exact = formatCardDate(timestamp, locale);
  if (relative === "" || exact === "") return <span>-</span>;
  return (
    <time
      dateTime={new Date(timestamp * 1000).toISOString()}
      title={exact}
      className="cards-detail-date"
    >
      {relative}
    </time>
  );
}

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
  const enableAnimations = useCell(settingsAtoms.enableAnimations);
  const signedIn = useAnilistSignedIn();
  const variants = useCardsCardVariants(item.kind, item.entityId);
  const { setCardVariant } = useCardsMutations();
  const [pickedVariant, setPickedVariant] = useState<CardVariant>(item.variant);
  const [openAnimeId, setOpenAnimeId] = useState<number | null>(null);
  const [spinning, setSpinning] = useState<boolean>(false);
  const rotatorRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const settleRef = useRef<Animation | null>(null);
  const rotationRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const ownedVariants = variants.data ?? [];
  const card =
    ownedVariants.find((entry) => entry.variant === pickedVariant) ?? item;
  const title = card.title.trim() === "" ? t("collection.detail.unknown.title") : card.title;
  const animeId = animeIdOf(card);
  // Anime cards carry no collection title, so their source line asks AniList
  // for the adaptation source (original, manga, light novel, ...).
  const animeQuery = useAppQuery("static", {
    queryKey: queryKeys.animeScreen(animeId ?? 0),
    queryFn: () => anilistApi.getAnimeById(animeId ?? 0),
    enabled: card.kind === "anime" && animeId !== null,
  });
  const sourceMaterial = card.kind === "anime" ? (animeQuery.data?.source ?? null) : null;
  const sourceLabelKey =
    sourceMaterial === null ? undefined : animeSourceLabelKeys[sourceMaterial];
  const source =
    sourceLabelKey !== undefined
      ? t(sourceLabelKey)
      : sourceMaterial !== null
        ? sourceMaterial.replaceAll("_", " ").toLowerCase()
        : card.collectionTitle?.trim() || t("collection.detail.no.source");
  // Dates describe the card, not the finish, so switching the variant never
  // changes the "obtained" age shown here.
  const cardFirstAt = ownedVariants.reduce(
    (earliest, entry) => Math.min(earliest, entry.firstObtainedAt),
    card.firstObtainedAt
  );
  const cardLastAt = ownedVariants.reduce(
    (latest, entry) => Math.max(latest, entry.lastObtainedAt),
    card.lastObtainedAt
  );

  // One transform owns the card: hover tilt and drag spin both write the same
  // pair of variables, so grabbing a tilted corner continues instead of snapping.
  const applyRotation = (rotateX: number, rotateY: number) => {
    rotationRef.current = { x: rotateX, y: rotateY };
    const rotator = rotatorRef.current;
    if (rotator === null) return;
    rotator.style.setProperty("--cards-spin-x", `${rotateX.toFixed(2)}deg`);
    rotator.style.setProperty("--cards-spin-y", `${rotateY.toFixed(2)}deg`);
    // The finishes read the same unitless angles the grid tilt writes, so the
    // foil and holo follow the card while it is being spun by hand.
    rotator.style.setProperty("--cards-tilt-deg-x", rotateX.toFixed(2));
    rotator.style.setProperty("--cards-tilt-deg-y", rotateY.toFixed(2));
    rotator.style.setProperty(
      "--cards-tilt-strength",
      Math.min(1, Math.max(Math.abs(rotateX) / HOVER_TILT_X, Math.abs(rotateY) / HOVER_TILT_Y)).toFixed(2)
    );
  };

  const applySheen = (rect: DOMRect, clientX: number, clientY: number) => {
    const rotator = rotatorRef.current;
    if (rotator === null || rect.width === 0 || rect.height === 0) return;
    rotator.style.setProperty(
      "--cards-tilt-shift-x",
      `${clamp(((clientX - rect.left) / rect.width) * 100, 0, 100).toFixed(1)}%`
    );
    rotator.style.setProperty(
      "--cards-tilt-shift-y",
      `${clamp(((clientY - rect.top) / rect.height) * 100, 0, 100).toFixed(1)}%`
    );
  };

  const hoverRotation = (rect: DOMRect, clientX: number, clientY: number) => {
    const offsetX = rect.width === 0 ? 0 : (clientX - rect.left) / rect.width - 0.5;
    const offsetY = rect.height === 0 ? 0 : (clientY - rect.top) / rect.height - 0.5;
    return { x: -offsetY * HOVER_TILT_X, y: offsetX * HOVER_TILT_Y };
  };

  // WAAPI bridges the release angle to the target, so the return plays for any
  // angle, including several full turns. The CSS variables are already on the
  // destination, so finishing or cancelling the animation never jumps.
  const settleRotation = (targetX: number, targetY: number) => {
    const rotator = rotatorRef.current;
    if (rotator === null) return;
    settleRef.current?.cancel();
    settleRef.current = null;
    if (!enableAnimations) {
      applyRotation(targetX, targetY);
      rotator.style.transition = "";
      return;
    }
    const fromX = rotationRef.current.x;
    const fromY = normalizeAngle(rotationRef.current.y);
    const toY = normalizeAngle(targetY);
    applyRotation(targetX, targetY);
    const animation = rotator.animate(
      [
        { transform: `perspective(900px) rotateX(${fromX}deg) rotateY(${fromY}deg)` },
        { transform: `perspective(900px) rotateX(${targetX}deg) rotateY(${toY}deg)` },
      ],
      { duration: 280, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }
    );
    settleRef.current = animation;
    animation.onfinish = () => {
      if (settleRef.current === animation) settleRef.current = null;
      rotator.style.transition = "";
    };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    // A native image drag would swallow pointermove everywhere except the
    // title and meta strips, which is why only some corners used to spin.
    event.preventDefault();
    const rotator = rotatorRef.current;
    if (rotator === null) return;
    settleRef.current?.cancel();
    settleRef.current = null;
    event.currentTarget.setPointerCapture(event.pointerId);
    rotator.style.transition = "none";
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      rotateX: rotationRef.current.x,
      rotateY: rotationRef.current.y,
    };
    setSpinning(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    applySheen(rect, event.clientX, event.clientY);
    const drag = dragRef.current;
    if (drag !== null) {
      drag.rotateY += (event.clientX - drag.x) * SPIN_SENSITIVITY;
      drag.rotateX = clamp(
        drag.rotateX - (event.clientY - drag.y) * SPIN_SENSITIVITY,
        -SPIN_LIMIT_X,
        SPIN_LIMIT_X
      );
      drag.x = event.clientX;
      drag.y = event.clientY;
      applyRotation(drag.rotateX, drag.rotateY);
      return;
    }
    if (!enableAnimations) return;
    const hover = hoverRotation(rect, event.clientX, event.clientY);
    applyRotation(hover.x, hover.y);
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setSpinning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    const target =
      inside && enableAnimations
        ? hoverRotation(rect, event.clientX, event.clientY)
        : { x: 0, y: 0 };
    settleRotation(target.x, target.y);
  };

  const handlePointerLeave = () => {
    if (dragRef.current !== null) return;
    applyRotation(0, 0);
  };

  const handleArtDragStart = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
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

  return (
    <Modal
      header={t("collection.detail.title")}
      onClose={onClose}
      className="w-[min(56rem,calc(100vw-1rem))]"
      contentClassName="p-0"
    >
      <div className="cards-detail">
        <div
          className="cards-detail-art"
          data-spinning={spinning ? "true" : undefined}
          onDragStart={handleArtDragStart}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onPointerLeave={handlePointerLeave}
        >
          <div ref={rotatorRef} className="cards-detail-rotator">
            <div className="cards-detail-face">
              <CardFace card={card} tilt="restrained" />
            </div>
            <div className="cards-detail-face cards-detail-face-back">
              <CardBack rarity={card.rarity} />
            </div>
          </div>
        </div>

        <div className="cards-detail-body">
          <header className="cards-detail-head">
            <span className="cards-detail-kicker">{t(cardKindLabelKeys[card.kind])}</span>
            <h2 className="cards-detail-title">{title}</h2>
            {animeId === null ? (
              <p className="cards-detail-source">{source}</p>
            ) : (
              <button
                type="button"
                className="cards-detail-source cards-detail-source-link"
                onClick={() => setOpenAnimeId(animeId)}
                title={t("collection.detail.open.anime")}
              >
                {source}
              </button>
            )}
          </header>

          {ownedVariants.length > 1 && (
            <div className="cards-detail-variant-select">
              <span className="windows95-text text-hint text-xs">
                {t("collection.detail.variant")}
              </span>
              <Select
                className="w-40"
                label={t("collection.detail.variant")}
                value={card.variant}
                options={ownedVariants.map((entry) => ({
                  value: entry.variant,
                  label: t(cardVariantLabelKeys[entry.variant]),
                }))}
                onChange={(value) => {
                  const next = value as CardVariant;
                  setPickedVariant(next);
                  setCardVariant.mutate({
                    kind: card.kind,
                    entityId: card.entityId,
                    variant: next,
                  });
                }}
              />
            </div>
          )}

          <dl className="cards-detail-grid">
            <div>
              <dt>{t("collection.detail.rarity")}</dt>
              <dd>{t(cardRarityLabelKeys[card.rarity])}</dd>
            </div>
            {card.variant === "normal" ? null : (
              <div>
                <dt>{t("collection.detail.variant")}</dt>
                <dd>{t(cardVariantLabelKeys[card.variant])}</dd>
              </div>
            )}
            <div>
              <dt>{t("collection.value")}</dt>
              <dd className="cards-detail-value">
                <img src="/money.png" alt="" className="chubrik-icon" />
                <span className="tabular-nums">{card.value}</span>
              </dd>
            </div>
            <div>
              <dt>{t("collection.copies")}</dt>
              <dd className="tabular-nums">{card.copies}</dd>
            </div>
            <div>
              <dt>{t("collection.detail.first")}</dt>
              <dd>
                <CardDate timestamp={cardFirstAt} />
              </dd>
            </div>
            <div>
              <dt>{t("collection.detail.last")}</dt>
              <dd>
                <CardDate timestamp={cardLastAt} />
              </dd>
            </div>
          </dl>

          <div className="cards-detail-actions">
            <GiftAction item={card} />
          </div>
        </div>
      </div>
    </Modal>
  );
}
