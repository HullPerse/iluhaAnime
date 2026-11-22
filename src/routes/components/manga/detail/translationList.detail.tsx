import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCell } from "@hullperse/hp_utils/react";
import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  getMangaReads,
  mangaLibraryKey,
  mangaReadKeys,
  setMangaChaptersRead,
} from "@/api/manga.api";
import type { MangaChapter, MangaHit, MangaSource } from "@/api/manga.api";
import Select from "@/components/ui/select.component";
import { useI18n } from "@/hooks/i18n.hook";
import { translationOptions } from "@/lib/manga/readerChapter.utils";
import { patchSettings, settingsAtoms } from "@/store/settings.store";
import { ChapterList } from "@/routes/components/manga/detail/chapterList.detail";

export function TranslationList({
  groups,
  source,
  hit,
  refreshAction,
  onPick,
}: {
  groups: MangaChapter[][];
  source: MangaSource;
  hit: MangaHit;
  refreshAction: ReactNode;
  onPick: (chapter: MangaChapter) => void;
}) {
  const { t } = useI18n();
  const preferences = useCell(settingsAtoms.mangaTranslation);
  const preferenceKey = `${source}:${hit.id}`;
  const client = useQueryClient();
  const readKey = mangaReadKeys(source, hit.id);
  const readKeys = useQuery({ queryKey: readKey, queryFn: () => getMangaReads(source, hit.id) });
  const reads = useMemo(() => new Set(readKeys.data), [readKeys.data]);
  const mark = useMutation({
    scope: { id: preferenceKey },
    mutationFn: ({ keys, read }: { keys: string[]; read: boolean }) =>
      setMangaChaptersRead(source, hit, keys, read),
    onSuccess: async (updated) => {
      client.setQueryData(readKey, updated);
      await client.invalidateQueries({ queryKey: mangaLibraryKey });
    },
  });
  const pendingKeys = new Set(mark.isPending ? mark.variables.keys : []);
  const onMark = (keys: string[], read: boolean) => {
    if (keys.length) mark.mutate({ keys, read });
  };

  const options = useMemo(
    () =>
      translationOptions(groups, t("manga.details.noGroup")).map(({ value, label, count }) => ({
        value,
        label: `${label} (${t("manga.details.translationCount", { count })})`,
      })),
    [groups, t]
  );
  const preference = preferences[preferenceKey];
  const value =
    options.find((option) => option.value === preference)?.value ?? options[0]?.value ?? "";

  return (
    <>
      <div className="bg-primary windows95-border flex shrink-0 items-center justify-end gap-1 p-1">
        {groups.length > 0 && (
          <Select
            label={t("manga.details.translations")}
            className="min-w-0 flex-1"
            value={value}
            options={options}
            onChange={(value) =>
              patchSettings({ mangaTranslation: { ...preferences, [preferenceKey]: value } })
            }
          />
        )}
        {refreshAction}
      </div>
      {mark.error && (
        <p className="text-destructive" role="alert">
          {t("manga.library.failed")}
        </p>
      )}
      <div
        className="min-h-0 flex-1 scrollbar-gutter-stable overflow-y-auto overscroll-contain"
        data-chapter-scroll
      >
        {" "}
        {groups.length > 0 && (
          <ChapterList
            groups={groups}
            translation={value}
            reads={reads}
            pendingKeys={pendingKeys}
            ready={readKeys.isSuccess}
            onMark={onMark}
            onPick={onPick}
          />
        )}
      </div>
    </>
  );
}
