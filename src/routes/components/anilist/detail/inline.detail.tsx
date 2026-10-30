import { useState } from "react";

import Modal from "@/components/shared/modal.component";
import type { ActivityDetailBundle } from "@/types/anilist/anilist";

import { AnimeDetailShell } from "./shell.detail";

export function InlineDetail({
  initialId,
  detail,
  onBack,
  onClose,
}: {
  initialId: number;
  detail: ActivityDetailBundle;
  onBack: () => void;
  onClose: () => void;
}) {
  const [stack, setStack] = useState<number[]>([initialId]);
  const current = stack.at(-1) ?? initialId;
  const back = () => {
    if (stack.length > 1) setStack((prev) => prev.slice(0, -1));
    else onBack();
  };
  const handleFavourite = (animeId: number) => detail.onFavouriteToggle(animeId);
  const handleStaffFavourite = (staffId: number) => detail.onStaffFavouriteToggle?.(staffId);
  const handleCharacterFavourite = (characterId: number) =>
    detail.onCharacterFavouriteToggle?.(characterId);
  const handleTag = (value: string) => detail.onTag(value);
  const handleGenre = (value: string) => detail.onGenre(value);
  const handleStudio = (id: number, name: string) => detail.onStudio?.(id, name);
  const handleSeason = (season: string, year: number | null) => detail.onSeason?.(season, year);
  const handleSaved = () => detail.onSaved?.();
  const handleRelated = (id: number) => setStack((prev) => [...prev, id]);

  return (
    <AnimeDetailShell
      animeId={current}
      entryLookup={detail.entryLookup}
      scoreFormat={detail.scoreFormat}
      listEntry={detail.entryLookup.get(current)}
      isLoggedIn={detail.isLoggedIn}
      favouriteIds={detail.favouriteIds}
      favouriteStaffIds={detail.favouriteStaffIds}
      favouriteCharacterIds={detail.favouriteCharacterIds}
      onFavouriteToggle={handleFavourite}
      onStaffFavouriteToggle={handleStaffFavourite}
      onCharacterFavouriteToggle={handleCharacterFavourite}
      onTag={handleTag}
      onGenre={handleGenre}
      onStudio={handleStudio}
      onSeason={handleSeason}
      onRelated={handleRelated}
      onBack={back}
      onClose={onClose}
      onSaved={handleSaved}
      render={({ title, actions, onBack: slotBack, body }) => (
        <Modal
          header={title}
          onBack={slotBack}
          headerActions={actions}
          onClose={onClose}
          className="w-5xl"
        >
          <div className="bg-primary min-h-0 w-full flex-1 overflow-y-auto">{body}</div>
        </Modal>
      )}
    />
  );
}
