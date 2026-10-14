import type { AniListOverlayContext, AniListOverlayScreen } from "@/types/anilist";

import { AnimeScreen } from "./animeScreen.detail";
import { CharacterScreen } from "./characterScreen.detail";
import { StaffScreen } from "./staffScreen.detail";

export function OverlayScreens({
  current,
  context,
}: {
  current: AniListOverlayScreen;
  context: AniListOverlayContext;
}) {
  if (current.kind === "character") return <CharacterScreen screen={current} context={context} />;
  if (current.kind === "staff") return <StaffScreen screen={current} context={context} />;
  return <AnimeScreen screen={current} context={context} />;
}
