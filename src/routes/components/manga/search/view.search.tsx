import { useCell } from "@hullperse/hp_utils/react";
import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { getMangaSources, mangaSources, mangaSourcesKey } from "@/api/manga.api";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import AniListListsRow from "@/routes/components/anilist/lists.anilist";
import { MangaState } from "@/routes/components/manga/state.manga";
import {
  mangaQuery,
  mangaSearchPerson,
  mangaSearchSource as sourceAtom,
} from "@/store/manga.store";
import { settingsAtoms } from "@/store/settings.store";
import { MangaSearchToolbar } from "@/routes/components/manga/search/toolbar.search";
import { SearchResults } from "@/routes/components/manga/search/results.search";
import { setSource } from "@/lib/manga/searchSource.utils";

export default function MangaSearch() {
  const { t } = useI18n();
  const toolbar = useRef<HTMLDivElement>(null);
  const query = useCell(mangaQuery);
  const person = useCell(mangaSearchPerson);
  const selectedSource = useCell(sourceAtom);
  const nsfw = useCell(settingsAtoms.mangaSourceNsfw);
  const settings = useQuery({ queryKey: mangaSourcesKey, queryFn: getMangaSources });
  const enabled = mangaSources.filter((item) =>
    settings.data?.some((row) => row.id === item.id && row.enabled)
  );
  const source = enabled.find((item) => item.id === selectedSource)?.id;
  const sources = source ? enabled.filter((item) => item.id === source) : enabled;

  return (
    <div className="grid grid-cols-1 gap-2 text-xs">
      <div ref={toolbar} className="bg-primary sticky top-0 z-20 grid grid-cols-1 gap-1 pb-1">
        <MangaSearchToolbar sources={enabled} nsfw={nsfw} query={query} />
        {query && person && (
          <p className="windows95-small-border bg-field text-hint px-2 py-1">
            {t(
              person.role === "author" ? "manga.search.personAuthor" : "manga.search.personArtist",
              { name: person.name }
            )}
          </p>
        )}
        {query && enabled.length > 0 && (
          <AniListListsRow
            label={t("manga.sources")}
            activeTab={source ?? ""}
            tabs={[
              { id: "", label: t("manga.search.allSources") },
              ...enabled.map(({ id, name }) => ({ id, label: name })),
            ]}
            onChange={(id) =>
              setSource(enabled.find((item) => item.id === id)?.id ?? null, toolbar.current)
            }
          />
        )}
      </div>
      {query &&
        sources.map(({ id, name }) => (
          <SearchResults
            key={id}
            name={name}
            source={id}
            query={query}
            nsfw={nsfw}
            person={person}
            expanded={source === id}
          />
        ))}
      {query && settings.isPending && (
        <MangaState kind="loading">{t("manga.library.loading")}</MangaState>
      )}
      {settings.error && (
        <MangaState kind="error">
          {t("manga.library.failed")}
          <Button
            onClick={async () => {
              await settings.refetch();
            }}
          >
            {t("manga.search.retry")}
          </Button>
        </MangaState>
      )}
    </div>
  );
}
