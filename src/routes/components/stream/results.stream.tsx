import { useCallback, useEffect, useRef, useState } from "react";

import Pagination from "@/components/shared/pagination.component";
import { Button } from "@/components/ui/button.component";
import { useResolvedHotkeys } from "@/hooks/hotkeys.hook";
import type { ResolvedHotkeyDef } from "@/hooks/hotkeys.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { isTextEntryTarget } from "@/lib/hotkeys/filter.hotkeys";
import { useCell } from "@/lib/state/signal.hook";
import {
  streamFilters,
  streamPage,
  streamQuery,
  streamStore,
  submitStreamSearch,
} from "@/store/stream.store";
import type { StreamSearchPage, StreamingAnime } from "@/types/stream";

import { StreamCard } from "./card.stream";
import { StreamEmpty, StreamError, StreamLoadingGrid } from "./states.stream";

/**
 * The site answers 60 titles per page. When the API sends its own `meta` the
 * real last page is used; otherwise a short page is treated as the last one,
 * so the control never promises a page the source does not have.
 */
const PAGE_SIZE = 60;

type GridKeyAction = "grid-left" | "grid-right" | "grid-up" | "grid-down";

/** The grid walks like the player's file tree: arrows plus j/k, one tile per step. */
const GRID_KEYBINDS: ResolvedHotkeyDef<GridKeyAction>[] = [
  { id: "grid-left", chord: "ArrowLeft", repeat: "hold", keybindId: "tree.collapse" },
  { id: "grid-right", chord: "ArrowRight", repeat: "hold", keybindId: "tree.expand" },
  { id: "grid-up", chord: "ArrowUp", repeat: "hold", keybindId: "tree.move.up" },
  { id: "grid-down", chord: "ArrowDown", repeat: "hold", keybindId: "tree.move.down" },
  { id: "grid-up", chord: "KeyK", repeat: "hold", keybindId: "tree.move.up" },
  { id: "grid-down", chord: "KeyJ", repeat: "hold", keybindId: "tree.move.down" },
];

/** How many tiles the CSS grid puts in a row right now. */
function gridColumns(element: HTMLElement | null): number {
  if (!element) return 1;
  const template = getComputedStyle(element).gridTemplateColumns;
  const count = template.split(" ").filter(Boolean).length;
  return Math.max(1, count);
}

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
  const sortBy = useCell(streamFilters).sortBy;
  const scrollRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  // Roving tabindex: one tile is the Tab stop and the arrows move it, so a
  // 60 tile page is one Tab away instead of sixty.
  const [activeIndex, setActiveIndex] = useState(0);
  const items = data?.items ?? [];

  useEffect(() => {
    if (activeIndex >= items.length) setActiveIndex(0);
  }, [activeIndex, items.length]);

  const focusTile = useCallback(
    (index: number) => {
      const count = items.length;
      if (count === 0) return;
      const next = Math.min(Math.max(index, 0), count - 1);
      setActiveIndex(next);
      const tiles = gridRef.current?.querySelectorAll<HTMLElement>("[data-stream-card]");
      tiles?.[next]?.focus();
    },
    [items.length]
  );

  useResolvedHotkeys<GridKeyAction>(GRID_KEYBINDS, {
    // Only inside this grid, and never while a field has the caret: the
    // toolbar and the modal share the window with those keys.
    ignore: (event) =>
      isTextEntryTarget(event.target) ||
      !(event.target instanceof HTMLElement) ||
      !gridRef.current?.contains(event.target),
    onAction: (action) => {
      const step = action === "grid-left" ? -1 : action === "grid-right" ? 1 : 0;
      const rows = action === "grid-up" ? -1 : action === "grid-down" ? 1 : 0;
      focusTile(activeIndex + (step || rows * gridColumns(gridRef.current)));
    },
  });

  if (isPending) {
    return <StreamLoadingGrid />;
  }

  if (error) {
    return (
      <StreamError title={t("stream.error.results")} detail={error.message} onRetry={onRetry} />
    );
  }

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
  // The site sends no `last_page` and no `total`: the envelope carries
  // `current_page`, `from`, `per_page` and `to`. A range line would be an
  // invented number, so the footer names the page and the page size instead.
  const total = data?.total ?? 0;
  const from = (page - 1) * PAGE_SIZE + 1;
  const to = (page - 1) * PAGE_SIZE + items.length;
  const orderLabel = query
    ? t("stream.searchResults")
    : sortBy === "views"
      ? t("stream.sort.popular")
      : sortBy === "created_at"
        ? t("stream.sort.latest")
        : sortBy === "name"
          ? t("stream.filters.sort.name")
          : t("stream.filters.sort.rating");
  const statusText = `${orderLabel} - ${t("stream.page", { page })} - ${t("stream.page.size", {
    count: PAGE_SIZE,
  })}`;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-1 overflow-hidden">
      <section
        ref={scrollRef}
        data-scroll-root
        aria-label={query ? t("stream.searchResults") : t("stream.popular")}
        className="windows95-border bg-field min-h-0 w-full flex-1 [scrollbar-gutter:stable] overflow-y-auto border p-1"
      >
        <div
          ref={gridRef}
          className="grid [grid-template-columns:repeat(auto-fill,minmax(9rem,1fr))] content-start gap-2"
        >
          {items.map((anime, index) => (
            <StreamCard
              key={anime.id}
              anime={anime}
              onOpen={() => onOpen(anime)}
              tabIndex={index === activeIndex ? 0 : -1}
              onFocus={() => setActiveIndex(index)}
            />
          ))}
        </div>
      </section>
      <Pagination
        total={total}
        page={page}
        lastPage={Math.max(lastPage, page)}
        from={from}
        to={to}
        statusText={statusText}
        onPageChange={(next) => streamStore.page.set(Math.max(1, next))}
        scrollRef={scrollRef}
      />
    </div>
  );
}
