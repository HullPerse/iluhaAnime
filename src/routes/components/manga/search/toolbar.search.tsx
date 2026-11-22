import { useCell } from "@hullperse/hp_utils/react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getMangaLibrary, mangaLibraryKey, mangaSources } from "@/api/manga.api";
import { AUTOCOMPLETE_HISTORY_LIMIT } from "@/config/search/autocomplete.config";
import { useI18n } from "@/hooks/i18n.hook";
import { useDebouncedValue } from "@/hooks/pacer.hook";
import { getInlineCompletion, getSearchSuggestions } from "@/lib/core/anilist/suggestions.utils";
import { catalogQuery } from "@/lib/manga/catalogQuery.utils";
import { mangaRatingVisible, sourceShowsNsfw } from "@/lib/manga/nsfw.utils";
import { MangaSearchField } from "@/routes/components/manga/searchField.manga";
import {
  mangaSearchDraft,
  mangaSearchHistory,
  mangaSearchPerson,
  searchLocalManga,
} from "@/store/manga.store";
import { settingsAtoms } from "@/store/settings.store";
import type { SearchSuggestion } from "@/types/search/search";

export function MangaSearchToolbar({
  sources,
  nsfw,
  query,
}: {
  sources: (typeof mangaSources)[number][];
  nsfw: Record<string, boolean>;
  query: string;
}) {
  const { t } = useI18n();
  const draft = useCell(mangaSearchDraft);
  const history = useCell(mangaSearchHistory);
  const person = useCell(mangaSearchPerson);
  const mode = useCell(settingsAtoms.autocompleteMode);
  const [focused, setFocused] = useState<boolean>(false);
  const value = draft.trim();
  const [debounced] = useDebouncedValue(value, { wait: 450 });
  const suggest = focused && mode !== "off" && value !== query;
  const fetchSuggestions = suggest && value.length >= 3 && value === debounced;
  const remote = useQueries({
    queries: sources.map(({ id }) => ({
      ...catalogQuery(id, debounced, 1, sourceShowsNsfw(nsfw, id), null),
      enabled: fetchSuggestions,
    })),
  });
  const library = useQuery({
    queryKey: [...mangaLibraryKey, "all"],
    queryFn: () => getMangaLibrary(true),
    enabled: suggest,
  });
  const results = fetchSuggestions
    ? remote.flatMap((result, sourceIndex) =>
        (result.data?.items ?? []).slice(0, 4).map((hit, index): SearchSuggestion => ({
          kind: "manga",
          value: hit.title,
          subtitle: sources[sourceIndex]?.name,
          score: 90 - index * 4,
        }))
      )
    : [];
  const recent = history;
  const suggestions = suggest
    ? getSearchSuggestions(value, {
        history: recent,
        backendSuggestions: results,
        extraValues: library.data?.items
          .filter((item) => mangaRatingVisible(item.rating, nsfw, item.source))
          .map((item) => ({
            kind: "manga",
            value: item.title,
            subtitle: t("manga.library.saved"),
          })),
        limit: 8,
      })
    : [];

  const submit = (input: string) => {
    const title = input.trim();

    if (title) {
      mangaSearchHistory.set(
        [
          title,
          ...history.filter((entry) => entry.toLocaleLowerCase() !== title.toLocaleLowerCase()),
        ].slice(0, AUTOCOMPLETE_HISTORY_LIMIT)
      );
    }

    const nextPerson = title && person && title === person.name ? person : undefined;
    searchLocalManga(title, nextPerson);
  };

  return (
    <MangaSearchField
      onSearch={() => submit(value)}
      aria-label={t("manga.search.query")}
      placeholder={t("manga.search.query")}
      value={draft}
      history={recent}
      suggestions={suggestions}
      completion={getInlineCompletion(value, suggestions)}
      onChange={(event) => mangaSearchDraft.set(event.currentTarget.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onSelectSuggestion={submit}
      onAcceptCompletion={(next) => mangaSearchDraft.set(next)}
      onRemoveHistory={(entry) => mangaSearchHistory.set(history.filter((item) => item !== entry))}
    />
  );
}
