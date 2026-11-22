import { useCell } from "@hullperse/hp_utils/react";
import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { getMangaLibrary, mangaLibraryKey } from "@/api/manga.api";
import type { MangaPersonSearch, MangaSource } from "@/api/manga.api";
import Pagination from "@/components/shared/pagination.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useMangaChapterCounts } from "@/hooks/manga/chapterCounts.hook";
import { catalogQuery } from "@/lib/manga/catalogQuery.utils";
import { sourceShowsNsfw } from "@/lib/manga/nsfw.utils";
import { MangaCard } from "@/routes/components/manga/card/tile.card";
import { MangaState } from "@/routes/components/manga/state.manga";
import { mangaDetail, mangaSearchPage as pageAtom } from "@/store/manga.store";
import { SearchResultsHeader } from "@/routes/components/manga/search/resultsHeader.search";
import { SearchResultError } from "@/routes/components/manga/search/resultError.search";
import { SOURCE_PREVIEW_SIZE } from "@/config/manga/search.config";

export function SearchResults({
  name,
  source,
  query,
  nsfw: nsfwBySource,
  person,
  expanded,
}: {
  name: string;
  source: MangaSource;
  query: string;
  nsfw: Record<string, boolean>;
  person: MangaPersonSearch | null;
  expanded: boolean;
}) {
  const nsfw = sourceShowsNsfw(nsfwBySource, source);
  const activePage = useCell(pageAtom);
  const page = expanded ? activePage : 1;
  const { t } = useI18n();
  const heading = useRef<HTMLHeadingElement>(null);
  const results = useQuery(catalogQuery(source, query, page, nsfw, person));
  const { data, error, isPending, refetch } = results;
  const hits = data?.items.slice(0, expanded ? undefined : SOURCE_PREVIEW_SIZE);
  const chaptersById = useMangaChapterCounts(source, hits);
  const library = useQuery({
    queryKey: [...mangaLibraryKey, "all"],
    queryFn: () => getMangaLibrary(true),
  });
  const saved = new Map(
    library.data?.items.filter((item) => item.source === source).map((item) => [item.mangaId, item])
  );

  if (!expanded && results.isSuccess && results.data.items.length === 0) return null;

  return (
    <section aria-label={name} className="ui-panel min-w-0">
      <SearchResultsHeader
        name={name}
        source={source}
        expanded={expanded}
        heading={heading}
        showAll={data?.hasNext === true || (data?.items.length ?? 0) > SOURCE_PREVIEW_SIZE}
      />
      <div className="bg-field grid gap-2 p-2" aria-busy={isPending}>
        {isPending && <MangaState kind="loading">{t("manga.search.loading")}</MangaState>}
        {error && <SearchResultError error={error} onRetry={refetch} />}
        {data && hits && (
          <>
            {hits.length > 0 && (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,9rem),1fr))] gap-2">
                {hits.map((hit) => (
                  <li key={hit.id} className="min-w-0">
                    <MangaCard
                      title={hit.title}
                      cover={hit.cover}
                      mosaic={hit.suggestive}
                      entry={saved.get(hit.id)}
                      status={library.data?.statuses.find(
                        (status) => status.id === saved.get(hit.id)?.status
                      )}
                      publicationStatus={hit.status}
                      chapters={hit.chapters ?? chaptersById.get(hit.id)}
                      onOpen={() => mangaDetail.set({ source, id: hit.id, title: hit.title })}
                    />
                  </li>
                ))}
              </ul>
            )}
            {expanded && (page > 1 || data.hasNext) && (
              <Pagination
                sequential
                total={0}
                from={0}
                to={0}
                page={page}
                lastPage={page + Number(data.hasNext)}
                onPageChange={(next) => {
                  pageAtom.set(next);
                  heading.current?.focus({ preventScroll: true });
                  heading.current?.scrollIntoView({ block: "start" });
                }}
                statusText={t("manga.search.page", { page })}
              />
            )}
          </>
        )}
      </div>
    </section>
  );
}
