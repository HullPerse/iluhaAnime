import { Star } from "lucide-react";
import { useEffect, useState } from "react";

import Modal from "@/components/shared/modal.component";
import Tabs from "@/components/shared/tabs.component";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import { enterOrSpace } from "@/lib/utils/keyboard.utils";
import type {
  AniFavouritesProps as Props,
  AniListOverlayContext,
  AniListOverlayScreen,
  FavouritesTab,
  FavouriteAnime,
  FavouritePerson,
} from "@/types/anilist";

import { OverlayScreens } from "./detail/screens.detail";

const TABS: readonly FavouritesTab[] = ["anime", "characters", "staff"];

function FavouriteAnimeRow({
  fav,
  onSelect,
}: {
  fav: FavouriteAnime;
  onSelect: (id: number) => void;
}) {
  const activate = () => onSelect(fav.id);
  return (
    <div
      className="windows95-active-border bg-primary hover:bg-surface flex flex-row items-center gap-2 p-1 hover:cursor-pointer"
      role="button"
      tabIndex={0}
      aria-label={fav.title.romaji}
      onClick={activate}
      onKeyDown={enterOrSpace(activate)}
    >
      {fav.cover_image?.medium ? (
        <ImageComponent
          src={fav.cover_image.medium}
          alt="cover_image.medium"
          className="windows95-active-border h-18 w-13 shrink-0"
        />
      ) : (
        <div className="windows95-active-border bg-field flex h-14 w-10 shrink-0 items-center justify-center text-xs">
          ?
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="windows95-text truncate text-xs font-bold" title={fav.title.romaji}>
          {fav.title.romaji}
        </span>
        <div className="mt-0.5 flex flex-row items-center gap-2 text-xs">
          {fav.mean_score != null && (
            <span className="bg-secondary text-primary flex flex-row items-center justify-center gap-0.5 px-1 text-xs font-bold">
              <Star className="size-3 fill-white" /> {fav.mean_score}
            </span>
          )}
          {fav.format && (
            <span className="windows95-font windows95-border text-text bg-field px-1 text-xs">
              {fav.format}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function FavouritePersonRow({
  person,
  onSelect,
}: {
  person: FavouritePerson;
  onSelect: (person: FavouritePerson) => void;
}) {
  const activate = () => onSelect(person);
  return (
    <div
      className="windows95-active-border bg-primary hover:bg-surface flex flex-row items-center gap-2 p-1 hover:cursor-pointer"
      role="button"
      tabIndex={0}
      aria-label={person.name}
      onClick={activate}
      onKeyDown={enterOrSpace(activate)}
    >
      {person.image ? (
        <ImageComponent
          src={person.image}
          alt={person.name}
          className="windows95-active-border h-18 w-13 shrink-0"
        />
      ) : (
        <div className="windows95-active-border bg-field flex h-14 w-10 shrink-0 items-center justify-center text-xs">
          ?
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="windows95-text truncate text-xs font-bold" title={person.name}>
          {person.name}
        </span>
      </div>
    </div>
  );
}

export default function AniListFavouritesModal({
  open,
  favourites,
  people,
  isLoggedIn,
  favouriteCharacterIds,
  favouriteStaffIds,
  onCharacterFavouriteToggle,
  onStaffFavouriteToggle,
  onClose,
  onAnimeClick,
}: Props) {
  const { t } = useI18n();
  const [tab, setTab] = useState<FavouritesTab>("anime");
  const [personStack, setPersonStack] = useState<AniListOverlayScreen[] | null>(null);

  useEffect(() => {
    if (open) {
      setTab("anime");
      setPersonStack(null);
    }
  }, [open]);

  if (!open) return null;

  const personTop = personStack?.at(-1) ?? null;
  const pushPerson = (screen: AniListOverlayScreen) =>
    setPersonStack((prev) => (prev ? [...prev, screen] : prev));
  const handlePersonBack = () => {
    if (personStack && personStack.length > 1) setPersonStack((prev) => prev?.slice(0, -1) ?? null);
    else setPersonStack(null);
  };
  const openPersonAnime = (id: number) => {
    setPersonStack(null);
    onClose();
    onAnimeClick(id);
  };
  const personContext: AniListOverlayContext = {
    isLoggedIn,
    favouriteCharacterIds,
    favouriteStaffIds,
    onCharacterFavouriteToggle,
    onStaffFavouriteToggle,
    onOpenAnime: openPersonAnime,
    onPush: pushPerson,
  };

  const counts: Record<FavouritesTab, number> = {
    anime: favourites.length,
    characters: people.characters.length,
    staff: people.staff.length,
  };

  return (
    <Modal
      header={t("anilist.favourites.title")}
      onClose={onClose}
      onBack={personStack ? handlePersonBack : undefined}
      className="w-2xl"
    >
      {personTop ? (
        <OverlayScreens current={personTop} context={personContext} />
      ) : (
        <>
          <div className="shrink-0">
            <Tabs
              ariaLabel={t("anilist.favourites.title")}
              tabs={TABS.map((id) => ({
                id,
                label: `${t(`anilist.favourites.${id}`)} (${counts[id]})`,
              }))}
              activeTab={tab}
              onChange={setTab}
            />
          </div>
          {counts[tab] === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <span className="windows95-text">{t(`anilist.favourites.empty.${tab}`)}</span>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {tab === "anime" &&
                favourites.map((fav) => (
                  <FavouriteAnimeRow
                    key={fav.id}
                    fav={fav}
                    onSelect={(id) => {
                      onClose();
                      onAnimeClick(id);
                    }}
                  />
                ))}
              {tab === "characters" &&
                people.characters.map((person) => (
                  <FavouritePersonRow
                    key={person.id}
                    person={person}
                    onSelect={(p) =>
                      setPersonStack([
                        { kind: "character", id: p.id, name: p.name, voiceActors: [] },
                      ])
                    }
                  />
                ))}
              {tab === "staff" &&
                people.staff.map((person) => (
                  <FavouritePersonRow
                    key={person.id}
                    person={person}
                    onSelect={(p) => setPersonStack([{ kind: "staff", id: p.id, name: p.name }])}
                  />
                ))}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
