import { ChevronLeft, ChevronRight, Dices, History, SortAsc, SortDesc } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { usePagedRow } from "@/hooks/pagedRow.hook";
import type { TranslationKey } from "@/lib/locale/i18n.utils";
import { useCell } from "@/lib/core/signal.hook";
import { setStreamSort, streamFilters } from "@/store/stream.store";
import type { StreamSortBy } from "@/types/player/stream";

/**
 * One sort axis, the same shape the AniList list uses: a feed and a named
 * ordering are keys of the same axis, so the bar has one active key and one
 * direction. A feed always means "the most first"; a named ordering starts in
 * the direction that reads naturally.
 */
const SORT_KEYS = [
  { key: "views", labelKey: "stream.sort.popular" },
  { key: "created_at", labelKey: "stream.sort.latest" },
  { key: "rating_score", labelKey: "stream.filters.sort.rating" },
  { key: "name", labelKey: "stream.filters.sort.name" },
] as const satisfies readonly { key: StreamSortBy; labelKey: TranslationKey }[];

/** Direction a key starts with when the user picks it. */
export const STREAM_SORT_DEFAULT_DIR: Record<StreamSortBy, "asc" | "desc"> = {
  views: "desc",
  created_at: "desc",
  rating_score: "desc",
  name: "asc",
};

/** Order the Shift+[ / Shift+] cycle walks, feeds first. */
export const STREAM_SORT_CYCLE: readonly StreamSortBy[] = SORT_KEYS.map(({ key }) => key);

export default function StreamSortBar({
  onHistoryOpen,
  onRandom,
}: {
  onHistoryOpen: () => void;
  onRandom?: () => void;
}) {
  const { t } = useI18n();
  const filters = useCell(streamFilters);
  const { sortBy, sortType } = filters;
  const activeIndex = SORT_KEYS.findIndex(({ key }) => key === sortBy);
  const { rowRef, start, end, stepPage } = usePagedRow(SORT_KEYS.length, activeIndex);

  const pick = (key: StreamSortBy) => {
    setStreamSort(
      key,
      key === sortBy ? (sortType === "asc" ? "desc" : "asc") : STREAM_SORT_DEFAULT_DIR[key]
    );
  };

  return (
    <section
      className="windows95-border bg-field flex flex-row items-center gap-2 px-1 py-0.5"
      aria-label={t("stream.sort.label")}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <Button
          size="icon"
          className="h-6 w-6 shrink-0"
          title={t("common.previous")}
          aria-label={t("common.previous")}
          onClick={() => stepPage(-1)}
        >
          <ChevronLeft className="size-3.5" />
        </Button>
        <div ref={rowRef} className="flex min-w-0 flex-1 gap-1 overflow-hidden">
          {SORT_KEYS.slice(start, end).map(({ key, labelKey }) => (
            <Button
              key={key}
              variant={sortBy === key ? "outline" : "default"}
              className="h-6 w-33 shrink-0 px-1"
              aria-current={sortBy === key ? true : undefined}
              onClick={() => pick(key)}
            >
              <span className="min-w-0 flex-1 truncate">{t(labelKey)}</span>
              {sortBy === key &&
                (sortType === "desc" ? (
                  <SortDesc className="size-3 shrink-0" />
                ) : (
                  <SortAsc className="size-3 shrink-0" />
                ))}
            </Button>
          ))}
        </div>
        <Button
          size="icon"
          className="h-6 w-6 shrink-0"
          title={t("common.next")}
          aria-label={t("common.next")}
          onClick={() => stepPage(1)}
        >
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
      <span className="ui-toolbar-separator" aria-hidden />
      {onRandom && (
        <Button
          size="icon"
          className="h-6 w-6 shrink-0"
          title={t("stream.random.button")}
          aria-label={t("stream.random.button")}
          onClick={onRandom}
        >
          <Dices className="size-3.5" />
        </Button>
      )}
      <Button
        size="icon"
        className="h-6 w-6 shrink-0"
        title={t("stream.history.button")}
        aria-label={t("stream.history.button")}
        onClick={onHistoryOpen}
      >
        <History className="size-3.5" />
      </Button>
    </section>
  );
}
