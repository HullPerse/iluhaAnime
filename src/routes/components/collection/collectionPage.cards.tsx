import { Button } from "@/components/ui/button.component";
import { useBinderColumns } from "@/hooks/cards/binderColumns.hook";
import { useCardsAnimeCollection } from "@/hooks/cards/queries.hook";
import { useCollectionRoster } from "@/hooks/cards/collectionRoster.hook";
import { useI18n } from "@/hooks/i18n.hook";
import type { CollectionItem } from "@/types/api/cards";

import CollectionSilhouette from "@/routes/components/collection/silhouette.cards";
import MissingMediaCard from "@/routes/components/collection/missingMediaCard.cards";
import BinderPocket from "@/routes/components/collection/pocket.cards";
import RosterFooter from "@/routes/components/collection/rosterFooter.cards";

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
  const { ref: binderRef, columns } = useBinderColumns(undefined, collection.data !== undefined);
  const pageSize = columns * 3;
  const collectionData = collection.data;
  const rosterView = useCollectionRoster(animeId, collectionKind, collectionData, pageSize);
  const { roster, slots, pageCount, currentPage } = rosterView;

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

  return (
    <div
      ref={binderRef}
      data-testid="anime-collection-page"
      className="flex min-h-0 [scrollbar-gutter:stable] flex-col overflow-x-clip overflow-y-auto"
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
            <MissingMediaCard
              title={title}
              coverUrl={data.coverUrl}
              kind={data.kind === "manga" ? "manga" : "anime"}
            />
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

      <div className="cards-binder" aria-busy={rosterView.loading}>
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
        hasMore={rosterView.hasMore}
        failed={rosterView.failed}
        loading={rosterView.loading}
        disabled={rosterView.busy}
        onRetry={async () => {
          await rosterView.retry();
        }}
        onMore={() => rosterView.requestMore()}
      />

      {pageCount > 1 && (
        <div className="mt-2 flex items-center justify-center gap-2">
          <Button
            className="h-6 px-2 text-xs"
            disabled={currentPage === 0}
            onClick={() => rosterView.goToPage(currentPage - 1)}
          >
            {t("collection.collection.prev")}
          </Button>
          <span className="windows95-text tabular-nums">
            {currentPage + 1} / {pageCount}
          </span>
          <Button
            className="h-6 px-2 text-xs"
            disabled={currentPage >= pageCount - 1}
            onClick={() => rosterView.goToPage(currentPage + 1)}
          >
            {t("collection.collection.next")}
          </Button>
        </div>
      )}
    </div>
  );
}
