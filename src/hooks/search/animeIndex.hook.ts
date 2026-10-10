import { useEffect } from "react";

import { prewarmSpelling } from "@/lib/search/suggestions.utils";
import { useCell } from "@/lib/state/signal.hook";
import { useUserAnilistData } from "@/routes/components/anilist/user/data.user";
import { indexSearchAniList, searchAtoms } from "@/store/search.store";
import { settingsAtoms } from "@/store/settings.store";

export function useEnsureAnimeIndex(): void {
  const { favourites, lists, user } = useUserAnilistData();
  useEffect(() => {
    if (user) indexSearchAniList(lists, favourites, user.id);
  }, [favourites, lists, user]);
}

/**
 * Warms the did-you-mean index off the critical path: the SymSpell delete map
 * is generated in idle slices whenever the anime index or search history
 * change, so the first correction does not block a render.
 */
export function usePrewarmSpellIndex(): void {
  const animeIndex = useCell(searchAtoms.animeIndex);
  const history = useCell(searchAtoms.history);
  const symSpellEnabled = useCell(settingsAtoms.searchSymSpellEnabled);
  useEffect(() => {
    if (!symSpellEnabled) return;
    return prewarmSpelling({ animeIndex, history, symSpell: symSpellEnabled });
  }, [animeIndex, history, symSpellEnabled]);
}
