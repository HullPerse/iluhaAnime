import { useI18n } from "@/hooks/i18n.hook";
import type { RosterCharacter } from "@/types/api/cards";

export default function CollectionSilhouette({ character }: { character: RosterCharacter }) {
  const { t } = useI18n();
  const title = character.title.trim() === "" ? `Character #${character.entityId}` : character.title;

  return (
    <div
      data-testid="collection-silhouette"
      className="cards-binder-pocket cards-collection-silhouette"
      title={title}
    >
      <div className="cards-collection-silhouette-art">
        {character.imageUrl === null ? (
          <span aria-hidden>{title.slice(0, 1)}</span>
        ) : (
          <img
            src={character.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        )}
      </div>
      <span className="cards-collection-silhouette-label">
        {t("collection.silhouette.unknown")}
      </span>
      <span className="cards-collection-silhouette-name">{title}</span>
    </div>
  );
}
