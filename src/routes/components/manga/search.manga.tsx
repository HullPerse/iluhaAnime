import { useCell } from "@hullperse/hp_utils/react";
import { queryOptions, useQueries, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState, type RefObject } from "react";

import {
  getMangaLibrary,
  getMangaSearchMeta,
  getMangaSources,
  mangaLibraryKey,
  mangaSources,
  mangaSourcesKey,
  searchManga,
} from "@/api/manga.api";
import type { MangaHit, MangaPersonSearch, MangaSource } from "@/api/manga.api";
import Pagination from "@/components/shared/pagination.component";
import { Button } from "@/components/ui/button.component";
import { AUTOCOMPLETE_HISTORY_LIMIT } from "@/config/search/autocomplete.config";
import { useI18n } from "@/hooks/i18n.hook";
import { useDebouncedValue } from "@/hooks/pacer.hook";
import { getInlineCompletion, getSearchSuggestions } from "@/lib/core/anilist/suggestions.utils";
import { ipcErrorCode } from "@/lib/core/system/ipcError.utils";
import { mangaRatingVisible, sourceShowsNsfw } from "@/lib/manga/nsfw.utils";
import { MangaSearchField } from "@/routes/components/manga/searchField.manga";
import { MangaCard } from "@/routes/components/manga/card.manga";
import AniListListsRow from "@/routes/components/anilist/lists.anilist";
import { MangaState } from "@/routes/components/manga/state.manga";
import {
  mangaDetail,
  mangaQuery,
  mangaSearchDraft,
  mangaSearchHistory,
  mangaSearchPage as pageAtom,
  mangaSearchPerson,
  mangaSearchSource as sourceAtom,
  searchLocalManga,
} from "@/store/manga.store";
import { settingsAtoms } from "@/store/settings.store";
import type { SearchSuggestion } from "@/types/search/search";

function setSource(source: MangaSource | null, anchor: HTMLElement | null) {
  pageAtom.set(1);
  sourceAtom.set(source);
  anchor?.closest("[data-scroll-root]")?.scrollTo({ top: 0 });
}

function catalogQuery(
  source: MangaSource,
  query: string,
  page: number,
  nsfw: boolean,
  person: MangaPersonSearch | null = null
) {
  return queryOptions({
    queryKey: [
      "manga",
      "catalog",
      source,
      query,
      page,
      nsfw,
      person?.role ?? null,
      person?.key ?? null,
      person?.source ?? null,
      source === "mangalib" ? settingsAtoms.mangaLibRequestDomain.get() : null,
    ],
    queryFn: () => searchManga(source, query, page, nsfw, person),
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

function MangaSearchToolbar({
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
  const [focused, setFocused] = useState(false);
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

const SOURCE_PREVIEW_SIZE = 4;

function useMangaChapterCounts(source: MangaSource, hits: MangaHit[] | undefined) {
  const missing = (hits ?? []).filter((hit) => hit.chapters == null).map((hit) => hit.id);
  const counts = useQuery({
    queryKey: ["manga", "chapters", source, missing],
    queryFn: () => getMangaSearchMeta(source, missing),
    enabled: (source === "mangalib" || source === "mangadex") && missing.length > 0,
    staleTime: 10 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return new Map(counts.data?.map((row) => [row.id, row.chapters]));
}

function SearchResults({
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

function SearchResultsHeader({
  name,
  source,
  expanded,
  heading,
  showAll,
}: {
  name: string;
  source: MangaSource;
  expanded: boolean;
  heading: RefObject<HTMLHeadingElement | null>;
  showAll: boolean;
}) {
  const { t } = useI18n();
  return (
    <header className="ui-titlebar justify-between">
      <h2 ref={heading} tabIndex={-1} className="flex min-w-0 scroll-mt-24 items-center gap-1">
        <img
          src={`/images/manga-sources/${source}.png`}
          alt=""
          width={16}
          height={16}
          className="size-4 shrink-0"
        />
        {name}
      </h2>
      {(expanded || showAll) && (
        <Button
          className="shrink-0"
          onClick={() => {
            setSource(expanded ? null : source, heading.current);
            heading.current?.focus({ preventScroll: true });
          }}
        >
          {expanded ? <ChevronLeft className="size-3" aria-hidden /> : null}
          {t(expanded ? "manga.search.backToSources" : "manga.search.all")}
          {expanded ? null : <ChevronRight className="size-3" aria-hidden />}
        </Button>
      )}
    </header>
  );
}

function SearchResultError({ error, onRetry }: { error: Error; onRetry: () => Promise<unknown> }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const code = ipcErrorCode(error);
  const errorText =
    code === "Blocked"
      ? t("manga.search.blocked")
      : code === "RateLimited"
        ? t("manga.search.rateLimited")
        : t("manga.search.failed");

  return (
    <MangaState kind="error">
      <span>{errorText}</span>
      {code === "Blocked" && (
        <Button
          onClick={async () => {
            await navigate({
              to: "/settings",
              search: { tab: "proxy", section: "proxy.manga" },
            });
          }}
        >
          {t("manga.sources.proxySettings")}
        </Button>
      )}
      <Button
        onClick={async () => {
          await onRetry();
        }}
      >
        {t("manga.search.retry")}
      </Button>
    </MangaState>
  );
}

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
