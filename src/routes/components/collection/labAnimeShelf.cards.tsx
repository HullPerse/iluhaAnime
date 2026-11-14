import { LAB_SHELF } from "@/config/cards/labFixtures.config";
import { useI18n } from "@/hooks/i18n.hook";

export default function LabAnimeShelf() {
  const { t } = useI18n();

  return (
    <div
      data-testid="lab-shelf"
      className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-2"
    >
      {LAB_SHELF.map((item) => {
        const owned = item.characters.filter((character) => character.owned).length;
        return (
          <article
            key={item.id}
            data-testid="lab-shelf-item"
            className="windows95-border bg-field flex min-w-0 gap-2 p-2"
          >
            <img
              src={item.cover}
              alt=""
              className="border-win-shadow h-28 w-20 shrink-0 border object-cover"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h3 className="windows95-text m-0 truncate font-bold" title={item.title}>
                {item.title}
              </h3>
              <p className="windows95-text text-hint m-0">
                {t("collection.cards")}: {owned}/{item.characters.length}
              </p>
              <div className="grid grid-cols-4 gap-1">
                {item.characters.map((character) => (
                  <div key={character.id} className="min-w-0">
                    <img
                      src={character.imageUrl}
                      alt=""
                      className={
                        character.owned
                          ? "border-win-shadow h-12 w-full border object-cover"
                          : "border-win-shadow h-12 w-full border object-cover opacity-25 grayscale"
                      }
                    />
                    <span
                      className={
                        character.owned
                          ? "windows95-text mt-0.5 block truncate"
                          : "windows95-text text-hint mt-0.5 block truncate"
                      }
                      title={character.owned ? character.name : undefined}
                    >
                      {character.owned ? character.name : "-"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
