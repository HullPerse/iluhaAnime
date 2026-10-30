import { useEffect, useState } from "react";

import Modal from "@/components/shared/modal.component";
import Tabs from "@/components/shared/tabs.component";
import { useI18n } from "@/hooks/i18n.hook";
import type {
  AniFavouritesProps as Props,
  AniListOverlayContext,
  AniListOverlayScreen,
  FavouritesTab,
} from "@/types/anilist/anilist";

import { OverlayScreens } from "@/routes/components/anilist/detail/screens.detail";
import { FavouriteAnimeRow } from "@/routes/components/anilist/favourites/animeRow.favourites";
import { FavouritePersonRow } from "@/routes/components/anilist/favourites/personRow.favourites";

const TABS: readonly FavouritesTab[] = ["anime", "characters", "staff"];

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
      header={personTop ? personTop.name : t("anilist.favourites.title")}
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
