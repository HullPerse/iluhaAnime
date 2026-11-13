import { useEffect, useMemo, useRef, useState } from "react";

import ImageComponent from "@/components/ui/image.component";
import { Button } from "@/components/ui/button.component";
import { useBinderColumns } from "@/hooks/cards/binderColumns.hook";
import { useCardsAnimeCollection, useCardsCollectionRoster } from "@/hooks/cards/queries.hook";
import { useI18n } from "@/hooks/i18n.hook";
import type { CollectionItem, RosterCharacter } from "@/types/api/cards";

import BinderPocket from "@/routes/components/collection/pocket.cards";
import CollectionSilhouette from "@/routes/components/collection/silhouette.cards";

const PREFETCH_PAGES = 2;

type CollectionSlot =
  | { kind: "owned"; card: CollectionItem }
  | { kind: "missing"; entityId: number };

function mergeRoster(base: RosterCharacter[], extra: RosterCharacter[]): RosterCharacter[] {
  const seen = new Set<number>();
  return [...base, ...extra].filter((character) => {
    if (seen.has(character.entityId)) return false;
    seen.add(character.entityId);
    return true;
  });
}

function MissingMediaCard({
  title,
  coverUrl,
  kind,
}: {
  title: string;
  coverUrl: string | null;
  kind: "anime" | "manga";
}) {
  const { t } = useI18n();
  return (
    <div className="cards-window cards-missing-media" data-testid="collection-main-missing">
      <div className="cards-window-bar" title={title}>
        <span>{title}</span>
      </div>
      <div className="cards-inner">
        <div className="cards-art">
          <ImageComponent
            src={coverUrl ?? ""}
            alt={title}
            type="cover"
            className="h-full w-full"
          />
        </div>
        <div className="cards-meta">
          <span className="cards-kind">{t(`collection.kind.${kind}`)}</span>
          <span className="cards-missing-label">{t("collection.silhouette.unknown")}</span>
        </div>
      </div>
    </div>
  );
}

function RosterFooter({
  hasMore,
  failed,
  loading,
  disabled,
  onRetry,
  onMore,
}: {
  hasMore: boolean;
  failed: boolean;
  loading: boolean;
  disabled: boolean;
  onRetry: () => void;
  onMore: () => void;
}) {
  const { t } = useI18n();
  if (!hasMore) return null;

  if (failed) {
    return (
      <div className="mt-2 flex flex-col items-center gap-1">
        <span className="windows95-text text-destructive" role="alert">
          {t("collection.error")}
        </span>
        <Button className="h-6 px-2 text-xs" onClick={onRetry}>
          {t("collection.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-col items-center gap-1">
      {loading && (
        <span className="windows95-text text-hint" role="status">
          {t("collection.collection.roster.loading")}
        </span>
      )}
      <Button className="h-6 px-2 text-xs" disabled={disabled} onClick={onMore}>
        {t("collection.collection.roster.more")}
      </Button>
    </div>
  );
}

export default function CollectionPageCards({
  animeId,
  collectionKind,
  onBack,
  onOpenCard,
}: {
  animeId: number;
  collectionKind: "anime" | "manga";
  onBack: () => void;
  onOpenCard: (card: CollectionItem) => void;
}) {
  const { t } = useI18n();
  const collection = useCardsAnimeCollection(animeId, collectionKind);
  // The measured element only exists once the page renders, so the column
  // measurement has to wait for the data instead of running on mount.
  const { ref: binderRef, columns } = useBinderColumns(undefined, collection.data !== undefined);
  const pageSize = columns * 3;
  const [page, setPage] = useState(0);
  const [extraRoster, setExtraRoster] = useState<RosterCharacter[]>([]);
  const [loadedRosterPage, setLoadedRosterPage] = useState<number | null>(null);
  const [rosterHasMore, setRosterHasMore] = useState<boolean | null>(null);
  const [requestedRosterPage, setRequestedRosterPage] = useState<number | null>(null);
  const rosterPageQuery = useCardsCollectionRoster(animeId, collectionKind, requestedRosterPage);
  const collectionIdentity = `${animeId}:${collectionKind}`;
  const previousIdentity = useRef(collectionIdentity);
  const prefetchedRoster = useRef(false);

  useEffect(() => {
    if (previousIdentity.current === collectionIdentity) return;
    previousIdentity.current = collectionIdentity;
    prefetchedRoster.current = false;
    setPage(0);
    setExtraRoster([]);
    setLoadedRosterPage(null);
    setRosterHasMore(null);
    setRequestedRosterPage(null);
  }, [collectionIdentity]);

  const collectionData = collection.data;
  const roster = useMemo(
    () => mergeRoster(collectionData?.roster ?? [], extraRoster),
    [collectionData?.roster, extraRoster]
  );

  const slots = useMemo<CollectionSlot[]>(() => {
    if (collectionData === undefined) return [];
    const characterItems = collectionData.items.filter((item) => item.kind === "character");
    const owned = characterItems.map<CollectionSlot>((card) => ({ kind: "owned", card }));
    const ownedCharacters = new Set(characterItems.map((item) => item.entityId));
    const missing = roster
      .filter((character) => !character.owned && !ownedCharacters.has(character.entityId))
      .map<CollectionSlot>((character) => ({
        kind: "missing",
        entityId: character.entityId,
      }));
    return [...owned, ...missing];
  }, [collectionData, roster]);

  const pageCount = Math.max(1, Math.ceil(slots.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const loadedPage = loadedRosterPage ?? collectionData?.rosterPage ?? 0;
  const hasMoreRoster = rosterHasMore ?? collectionData?.rosterHasMore ?? false;
  const rosterPageData = rosterPageQuery.data;

  useEffect(() => {
    if (rosterPageData === undefined) return;
    setExtraRoster((current) => mergeRoster(current, rosterPageData.characters));
    setLoadedRosterPage(rosterPageData.page);
    setRosterHasMore(rosterPageData.hasMore);
    setRequestedRosterPage(null);
  }, [rosterPageData]);

  useEffect(() => {
    if (collectionData === undefined || !hasMoreRoster) return;
    if (requestedRosterPage !== null || rosterPageQuery.isFetching) return;
    const nearEnd = currentPage >= pageCount - PREFETCH_PAGES;
    if (!nearEnd && prefetchedRoster.current) return;
    prefetchedRoster.current = true;
    setRequestedRosterPage(loadedPage + 1);
  }, [
    collectionData,
    hasMoreRoster,
    requestedRosterPage,
    rosterPageQuery.isFetching,
    currentPage,
    pageCount,
    loadedPage,
  ]);

  if (collection.isPending) {
    return <p className="windows95-text text-hint p-2">{t("collection.loading")}</p>;
  }
  if (collection.isError || collectionData === undefined) {
    return (
      <div className="flex flex-col items-center gap-2 p-6">
        <span className="windows95-text text-destructive text-center" role="alert">
          {t("collection.error")}
        </span>
        <div className="flex gap-1">
          <Button onClick={onBack}>{t("collection.collection.back")}</Button>
          <Button onClick={() => collection.refetch()}>{t("collection.retry")}</Button>
        </div>
      </div>
    );
  }

  const data = collectionData;
  const title = data.title.trim() === "" ? `Anime #${data.animeId}` : data.title;
  const mediaCards = data.items.filter((item) => item.kind === data.kind);
  const characterItems = data.items.filter((item) => item.kind === "character");
  const ownedCharacters = new Set(characterItems.map((item) => item.entityId)).size;
  const pageSlots = slots.slice(currentPage * pageSize, currentPage * pageSize + pageSize);
  const rosterById = new Map(roster.map((character) => [character.entityId, character]));
  const rosterLoading = rosterPageQuery.isFetching;
  const rosterFailed = rosterPageQuery.isError && requestedRosterPage !== null;

  return (
    <div
      ref={binderRef}
      data-testid="anime-collection-page"
      className="flex min-h-0 flex-col overflow-y-auto"
    >
      <div className="ui-toolbar shrink-0">
        <Button className="h-6 px-2 text-xs" onClick={onBack}>
          {t("collection.collection.back")}
        </Button>
        <span className="windows95-text ml-auto">
          {t("collection.collection.page", { page: currentPage + 1, pages: pageCount })}
        </span>
      </div>

      <div className="cards-collection-hero">
        <div data-testid="collection-main" className="cards-collection-main-grid">
          {mediaCards.length === 0 ? (
            <MissingMediaCard title={title} coverUrl={data.coverUrl} kind={data.kind as "anime" | "manga"} />
          ) : (
            mediaCards.map((card) => (
              <BinderPocket
                key={`main-${card.entityId}-${card.rarity}-${card.variant}`}
                card={card}
                index={0}
                onOpen={onOpenCard}
              />
            ))
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="windows95-text text-text m-0 text-sm font-bold">{title}</h2>
          <p className="windows95-text text-hint m-0 mt-1" data-testid="collection-progress">
            {t("collection.collection.characters.progress", {
              owned: ownedCharacters,
              total: data.rosterTotal,
            })}
          </p>
          {!data.rosterAvailable && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="windows95-text text-hint">
                {t("collection.collection.roster.unavailable")}
              </span>
              <Button className="h-6 px-2 text-xs" onClick={() => collection.refetch()}>
                {t("collection.retry")}
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="cards-binder" aria-busy={rosterLoading}>
        <div className="cards-binder-rings" aria-hidden>
          {Array.from({ length: 6 }, (_, index) => (
            <span key={index} />
          ))}
        </div>
        <div className="cards-binder-sheet">
          <div
            className="cards-binder-page cards-binder-grid"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: pageSize }, (_, index) => {
              const slot = pageSlots[index];
              if (slot === undefined) {
                return <BinderPocket key={`empty-${index}`} card={null} index={index} />;
              }
              if (slot.kind === "owned") {
                return (
                  <BinderPocket
                    key={`owned-${slot.card.kind}-${slot.card.entityId}-${slot.card.rarity}-${slot.card.variant}`}
                    card={slot.card}
                    index={index}
                    onOpen={onOpenCard}
                  />
                );
              }
              const character = rosterById.get(slot.entityId);
              return character === undefined ? (
                <BinderPocket key={`missing-${slot.entityId}`} card={null} index={index} />
              ) : (
                <CollectionSilhouette key={`missing-${slot.entityId}`} character={character} />
              );
            })}
          </div>
        </div>
      </div>

      <RosterFooter
        hasMore={hasMoreRoster}
        failed={rosterFailed}
        loading={rosterLoading}
        disabled={rosterLoading || requestedRosterPage !== null}
        onRetry={async () => {
          await rosterPageQuery.refetch();
        }}
        onMore={() => setRequestedRosterPage(loadedPage + 1)}
      />

      {pageCount > 1 && (
        <div className="mt-2 flex items-center justify-center gap-2">
          <Button
            className="h-6 px-2 text-xs"
            disabled={currentPage === 0}
            onClick={() => setPage((value) => Math.max(0, value - 1))}
          >
            {t("collection.collection.prev")}
          </Button>
          <span className="windows95-text tabular-nums">
            {currentPage + 1} / {pageCount}
          </span>
          <Button
            className="h-6 px-2 text-xs"
            disabled={currentPage >= pageCount - 1}
            onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
          >
            {t("collection.collection.next")}
          </Button>
        </div>
      )}
    </div>
  );
}
