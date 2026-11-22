import { useCell } from "@hullperse/hp_utils/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Trash2 } from "lucide-react";
import { useState } from "react";

import { clearMangaHistory, getMangaHistory, mangaHistoryKey } from "@/api/manga.api";
import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/hooks/i18n.hook";
import { normalizeSearchText } from "@/lib/core/anilist/suggestions.utils";
import { historyDay, timeZone } from "@/lib/manga/history.utils";
import { HistoryRow } from "@/routes/components/manga/history/row.history";
import { MangaState } from "@/routes/components/manga/state.manga";
import { settingsAtoms } from "@/store/settings.store";
import type { HistoryEntry } from "@/types/manga/history";

export default function MangaHistory() {
  const { t } = useI18n();
  const nsfw = useCell(settingsAtoms.mangaSourceNsfw);
  const client = useQueryClient();
  const [search, setSearch] = useState<string>("");
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
