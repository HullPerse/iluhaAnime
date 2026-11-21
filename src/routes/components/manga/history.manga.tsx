import { useCell } from "@hullperse/hp_utils/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Search, Trash2 } from "lucide-react";
import { useState } from "react";

import { clearMangaHistory, getMangaHistory, mangaHistoryKey, mangaSources } from "@/api/manga.api";
import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/hooks/i18n.hook";
import { normalizeSearchText } from "@/lib/core/anilist/suggestions.utils";
import { mangaRatingMosaic } from "@/lib/manga/nsfw.utils";
import { MangaCover } from "@/routes/components/manga/cover.manga";
import { MangaState } from "@/routes/components/manga/state.manga";
import { mangaDetail } from "@/store/manga.store";
import { settingsAtoms } from "@/store/settings.store";

type HistoryEntry = Awaited<ReturnType<typeof getMangaHistory>>[number];

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

function historyDay(stamp: number) {
  return new Date(stamp).toDateString();
}

function HistoryRow({ row, nsfw }: { row: HistoryEntry; nsfw: Record<string, boolean> }) {
  const { t } = useI18n();
  const source = mangaSources.find(({ id }) => id === row.source);
  const chapter = t("manga.details.chapter", { number: row.chapterKey });
  const opened = new Date(row.openedAt);

  return (
    <li>
      <button
        type="button"
        aria-label={`${row.title} - ${chapter}`}
        className="windows95-text hover:bg-field focus-visible:bg-field focus-visible:outline-text flex w-full cursor-pointer items-center gap-2 px-2 py-2 text-start focus-visible:outline-1 focus-visible:-outline-offset-2 focus-visible:outline-dotted"
        onClick={() =>
          mangaDetail.set({
            source: row.source,
            id: row.mangaId,
            title: row.title,
            chapterKey: row.chapterKey,
            chapterId: row.chapterId,
          })
        }
      >
        <MangaCover
          src={row.cover ?? null}
          mosaic={mangaRatingMosaic(row.rating, nsfw, row.source)}
          className="windows95-small-border w-10 shrink-0"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-bold" title={row.title}>
            {row.title}
          </span>
          <span className="text-hint truncate">
            {chapter}
            {source && <small className="text-[0.9em]"> · {source.name}</small>}
          </span>
        </span>
        <time dateTime={opened.toISOString()} className="text-hint shrink-0 tabular-nums">
          {opened.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit", timeZone })}
        </time>
        <ChevronRight className="size-4 shrink-0" aria-hidden />
      </button>
    </li>
  );
}

export default function MangaHistory() {
  const { t } = useI18n();
  const nsfw = useCell(settingsAtoms.mangaSourceNsfw);
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const history = useQuery({
    queryKey: [...mangaHistoryKey, "all"],
    queryFn: () => getMangaHistory(true),
  });
  const clear = useMutation({
    mutationFn: clearMangaHistory,
    onSuccess: () => client.invalidateQueries({ queryKey: mangaHistoryKey }),
  });

  const filter = normalizeSearchText(search.trim());
  const groups = new Map<string, HistoryEntry[]>();
  for (const row of history.data ?? []) {
    if (filter && !normalizeSearchText(row.title).includes(filter)) continue;
    const day = historyDay(row.openedAt);
    const group = groups.get(day);
    if (group) group.push(row);
    else groups.set(day, [row]);
  }
  const now = new Date();
  const today = now.toDateString();
  now.setDate(now.getDate() - 1);
  const yesterday = now.toDateString();

  return (
    <div className="flex min-w-0 flex-col gap-2 text-xs">
      <div className="ui-toolbar ui-panel flex-nowrap gap-1">
        <div className="relative min-w-0 flex-1">
          <Search
            className="text-hint pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            aria-label={t("manga.history.search")}
            placeholder={t("manga.history.search")}
            className="h-8 w-full pl-7"
          />
        </div>
        <span className="ui-toolbar-separator" aria-hidden />
        <Button
          size="icon"
          className="size-8"
          aria-label={t("manga.history.clear")}
          title={t("manga.history.clear")}
          loading={clear.isPending}
          disabled={!history.data?.length}
          onClick={() => clear.mutate()}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>
      {history.isPending && <MangaState kind="loading">{t("manga.library.loading")}</MangaState>}
      {history.error && (
        <MangaState kind="error">
          {t("manga.library.failed")}
          <Button
            onClick={async () => {
              await history.refetch();
            }}
          >
            {t("manga.search.retry")}
          </Button>
        </MangaState>
      )}
      {clear.error && <MangaState kind="error">{t("manga.library.failed")}</MangaState>}
      {[...groups].map(([day, rows]) => (
        <section key={day} className="ui-panel min-w-0">
          <h2 className="ui-titlebar px-2">
            {day === today
              ? t("manga.history.today")
              : day === yesterday
                ? t("manga.history.yesterday")
                : new Date(day).toLocaleDateString("ru", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    timeZone,
                  })}
          </h2>
          <ul className="divide-muted divide-y">
            {rows.map((row) => (
              <HistoryRow key={`${row.itemId}:${row.chapterKey}`} row={row} nsfw={nsfw} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
