import { useEffect } from "react";

import { prewarmSpelling } from "@/lib/suggestions.utils";
import { markIndexReady } from "@/lib/signals.utils";
import { useCell } from "@/lib/signal.hook";
import { useUserAnilistData } from "@/routes/components/anilist/user/data.user";
import { indexSearchAniList, searchAtoms } from "@/store/search.store";
import { settingsAtoms } from "@/store/settings.store";

export function useEnsureAnimeIndex(): void {
  const { favourites, lists, user } = useUserAnilistData();
  useEffect(() => {
    if (user) indexSearchAniList(lists, favourites, user.id);
    markIndexReady();
  }, [favourites, lists, user]);
}

export function usePrewarmSpellIndex(): void {
  const animeIndex = useCell(searchAtoms.animeIndex);
  const history = useCell(searchAtoms.history);
  const symSpellEnabled = useCell(settingsAtoms.searchSymSpellEnabled);
  useEffect(() => {
    if (!symSpellEnabled) return;
    return prewarmSpelling({ animeIndex, history, symSpell: symSpellEnabled });
  }, [animeIndex, history, symSpellEnabled]);
}
