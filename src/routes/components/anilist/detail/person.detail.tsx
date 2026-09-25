import { useCallback, useState } from "react";

import type { AniListOverlayContext, AniListOverlayScreen } from "@/types/anilist";

import { OverlayWindow } from "../overlayWindow.anilist";
import { AnimeScreen } from "./animeScreen.detail";
import { CharacterScreen } from "./characterScreen.detail";
import { StaffScreen } from "./staffScreen.detail";

function AniListPersonDetailModal({
  kind,
  personId,
  personName,
  isLoggedIn,
  favouriteCharacterIds,
  favouriteStaffIds,
  onCharacterFavouriteToggle,
  onStaffFavouriteToggle,
  onRelated,
  onClose,
}: {
  kind: "character" | "staff";
  personId: number;
  personName: string;
  isLoggedIn: boolean;
  favouriteCharacterIds?: Set<number>;
  favouriteStaffIds?: Set<number>;
  onCharacterFavouriteToggle?: (id: number) => void;
  onStaffFavouriteToggle?: (id: number) => void;
  onRelated?: (id: number) => void;
  onClose: () => void;
}) {
  const [stack, setStack] = useState<AniListOverlayScreen[]>(() => [
    kind === "character"
      ? { kind, id: personId, name: personName, voiceActors: [] }
      : { kind, id: personId, name: personName },
  ]);
  const current = stack.at(-1)!;
  const push = useCallback((screen: AniListOverlayScreen) => {
    setStack((prev) => [...prev, screen]);
  }, []);
  const pop = useCallback(() => setStack((prev) => prev.slice(0, -1)), []);

  const context: AniListOverlayContext = {
    isLoggedIn,
    favouriteCharacterIds,
    favouriteStaffIds,
    onCharacterFavouriteToggle,
    onStaffFavouriteToggle,
    onOpenAnime: (id) => onRelated?.(id),
    onPush: push,
  };

  return (
    <OverlayWindow
      header={current.name}
      onBack={stack.length > 1 ? pop : undefined}
      onClose={onClose}
    >
      {current.kind === "character" ? (
        <CharacterScreen screen={current} context={context} />
      ) : current.kind === "staff" ? (
        <StaffScreen screen={current} context={context} />
      ) : (
        <AnimeScreen screen={current} context={context} />
      )}
    </OverlayWindow>
  );
}

export default AniListPersonDetailModal;
