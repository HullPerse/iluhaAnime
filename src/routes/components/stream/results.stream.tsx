import { useRef } from "react";

import Pagination from "@/components/shared/pagination.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useCell } from "@/lib/state/signal.hook";
import { streamPage, streamQuery, streamStore, submitStreamSearch } from "@/store/stream.store";
import type { StreamSearchPage, StreamingAnime } from "@/types/stream";

import { StreamCard } from "./card.stream";
import { StreamEmpty, StreamError, StreamLoadingGrid } from "./states.stream";

/**
 * The site answers 60 titles per page. When the API sends its own `meta` the
 * real last page is used; otherwise a short page is treated as the last one,
 * so the control never promises a page the source does not have.
 */
const PAGE_SIZE = 60;

export default function StreamResults({
  data,
  isPending,
  error,
  onOpen,
  onRetry,
}: {
  data: StreamSearchPage | undefined;
  isPending: boolean;
  error: Error | null;
  onOpen: (anime: StreamingAnime) => void;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const query = useCell(streamQuery);
  const requestPage = useCell(streamPage);
  const scrollRef = useRef<HTMLElement>(null);

  if (isPending) {
    return <StreamLoadingGrid />;
  }

  if (error) {
    return (
      <StreamError title={t("stream.error.results")} detail={error.message} onRetry={onRetry} />
    );
  }

  const items = data?.items ?? [];
  if (items.length === 0) {
    return (
      <StreamEmpty
        message={query ? t("stream.noResults.query", { query }) : t("stream.noResults")}
        action={
          query ? (
            <Button className="h-6 px-2 text-xs" onClick={() => submitStreamSearch("")}>
              {t("stream.clear")}
            </Button>
          ) : undefined
        }
      />
    );
  }

  const page = data?.page ?? requestPage;
  const lastPage = data?.lastPage ?? (items.length < PAGE_SIZE ? page : page + 1);
  const total = data?.total ?? (page - 1) * PAGE_SIZE + items.length;
  const from = (page - 1) * PAGE_SIZE + 1;
  const to = (page - 1) * PAGE_SIZE + items.length;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-1 overflow-hidden">
      <section
        ref={scrollRef}
        data-scroll-root
        aria-label={query ? t("stream.searchResults") : t("stream.popular")}
        className="windows95-border bg-field min-h-0 w-full flex-1 border p-1 [scrollbar-gutter:stable] overflow-y-auto"
      >
        <div className="grid content-start gap-2 [grid-template-columns:repeat(auto-fill,minmax(7.5rem,1fr))]">
          {items.map((anime) => (
            <StreamCard key={anime.id} anime={anime} onOpen={() => onOpen(anime)} />
          ))}
        </div>
      </section>
      <Pagination
        total={total}
        page={page}
        lastPage={Math.max(lastPage, page)}
        from={from}
        to={to}
        statusText={query ? t("stream.searchResults") : t("stream.popular")}
        onPageChange={(next) => streamStore.page.set(Math.max(1, next))}
        scrollRef={scrollRef}
      />
    </div>
  );
}
