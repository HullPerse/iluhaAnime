import type { AniListOverlayContext, AniListOverlayScreen } from "@/types/anilist/anilist";

import { AnimeScreen } from "@/routes/components/anilist/detail/animeScreen.detail";
import { CharacterScreen } from "@/routes/components/anilist/detail/characterScreen.detail";
import { StaffScreen } from "@/routes/components/anilist/detail/staffScreen.detail";

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
