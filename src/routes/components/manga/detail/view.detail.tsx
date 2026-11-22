import { reportBackgroundError } from "@hullperse/hp_utils/attempt";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { RotateCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { mangaSources } from "@/api/manga.api";
import type { MangaChapter, MangaPersonRole, MangaReaderInput, MangaSource } from "@/api/manga.api";
import Modal from "@/components/shared/modal.component";
import Section from "@/components/shared/section.component";
import { SmallLoader } from "@/components/shared/loader/small.loader";
import { Button } from "@/components/ui/button.component";
import { useMangaDetailData } from "@/hooks/manga/detail.hook";
import { useMangaReadingPresence } from "@/hooks/manga/reader/presence.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { groupChapters, readerChapter } from "@/lib/manga/readerChapter.utils";
import MangaReader from "@/routes/components/manga/reader/view.reader";
import { MangaCover } from "@/routes/components/manga/cover.manga";
import SaveManga from "@/routes/components/manga/detail/save.detail";
import { searchLocalManga } from "@/store/manga.store";
import { TranslationList } from "@/routes/components/manga/detail/translationList.detail";
import { MangaHeaderActions } from "@/routes/components/manga/detail/headerActions.detail";
import { DetailPeople } from "@/routes/components/manga/detail/people.detail";

export default function MangaDetail({
  source,
  id,
  title,
  chapterKey,
  chapterId,
  nsfw,
  onClose,
}: {
  source: MangaSource;
  id: string;
  title: string;
  chapterKey?: string;
  chapterId?: string;
  nsfw: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [chapter, setChapter] = useState<MangaChapter | null>(null);
  const [missingChapter, setMissingChapter] = useState<boolean>(false);
  const visitedHistory = useRef<boolean>(false);
  const { data, error, isPending, refetch, refresh } = useMangaDetailData(source, id, nsfw);
  const groups = useMemo(() => groupChapters(data?.chapters ?? []), [data]);
  const reading = chapter !== null && data !== undefined;
  useMangaReadingPresence(data?.title.title, chapter?.number);
  useEffect(() => {
    if (!reading) return;
    const win = getCurrentWindow();
    const fullscreen = win.isFullscreen().then(async (already) => {
      if (!already) await win.setFullscreen(true);

      return already;
    });
    fullscreen.catch((error: unknown) => reportBackgroundError("manga.fullscreen.open", error));

    return () => {
      fullscreen
        .then((already) => (already ? undefined : win.setFullscreen(false)))
        .catch((error: unknown) => reportBackgroundError("manga.fullscreen.close", error));
    };
  }, [reading]);
  useEffect(() => {
    if ((!chapterKey && !chapterId) || !data || visitedHistory.current) return;
    visitedHistory.current = true;
    const row =
      data.chapters.find((row) => row.id === chapterId && !row.locked) ??
      data.chapters.find((row) => row.key === chapterKey && !row.locked);

    if (row) setChapter(row);
    else setMissingChapter(true);
  }, [chapterId, chapterKey, data]);
  const searchFor = (query: string, role?: MangaPersonRole, key?: string) => {
    const value = query.trim();

    if (!value) return;
    onClose();
    searchLocalManga(
      value,
      role ? { name: value, role, ...(key ? { key } : {}), source } : undefined
    );
  };

  if (reading) {
    const group = groups.findIndex((rows) => rows[0]?.key === chapter.key);
    const readerInput = (row: MangaChapter): MangaReaderInput => ({
      source,
      mangaId: id,
      chapterId: row.id,
      number: row.number,
      volume: row.volume,
      branch: row.branch,
    });
    const nextChapter = readerChapter(groups[group - 1] ?? [], chapter);
    const jump = (index: number) => {
      const target = readerChapter(groups[index] ?? [], chapter);

      return target ? () => setChapter(target) : undefined;
    };

    const chapters = groups.flatMap((rows) => {
      const target = readerChapter(rows, chapter);

      return target ? [target] : [];
    });

    return (
      <MangaReader
        key={chapter.id}
        chapter={readerInput(chapter)}
        nextChapter={nextChapter ? readerInput(nextChapter) : undefined}
        title={data.title.title}
        hit={data.title}
        chapters={chapters}
        onJump={(target) => setChapter(target)}
        chapterKey={chapter.key}
        previousKeys={groups
          .slice(group)
          .flatMap((rows) => (rows[0] && rows.some((row) => !row.locked) ? [rows[0].key] : []))}
        previous={jump(group + 1)}
        next={jump(group - 1)}
        onClose={() => setChapter(null)}
      />
    );
  }

  return (
    <Modal
      header={data?.title.title ?? title}
      onClose={onClose}
      className="w-208 max-w-[94%]"
      contentClassName="min-h-0 overflow-hidden!"
      headerActions={
        <MangaHeaderActions source={source} id={id} hit={data?.title} onClose={onClose} />
      }
    >
      {isPending && (
        <div
          role="status"
          className="windows95-border bg-field text-hint flex min-h-40 items-center justify-center gap-2 text-xs"
        >
          <SmallLoader size={3} />
          {t("manga.details.loading")}
        </div>
      )}
      {(refresh.error || (error && !data)) && (
        <div
          role="alert"
          className="windows95-border bg-field flex flex-wrap items-center gap-2 p-2 text-xs"
        >
          {t(refresh.error ? "manga.details.refreshFailed" : "manga.details.failed")}
          <Button
            onClick={async () => {
              if (refresh.error) refresh.mutate();
              else await refetch();
            }}
          >
            {t("manga.search.retry")}
          </Button>
        </div>
      )}
      {missingChapter && <p role="status">{t("manga.reader.chapterUnavailable")}</p>}
      {data && (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 text-xs">
          <section className="flex min-w-0 shrink-0 items-start gap-2">
            <div className="flex w-[clamp(6rem,18vw,9rem)] shrink-0 flex-col gap-1">
              <MangaCover
                src={data.title.cover}
                mosaic={data.title.suggestive}
                className="windows95-border bg-field w-full"
              />
              <SaveManga
                source={source}
                hit={data.title}
                unread={groups.filter((rows) => rows.some((row) => !row.locked)).length}
                nsfw={nsfw}
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-center gap-1">
                <h2 className="windows95-text min-w-0 flex-1 text-sm leading-tight font-bold wrap-anywhere">
                  <button
                    type="button"
                    className="windows95-text text-text w-full cursor-pointer border-0 bg-transparent p-0 text-start text-sm leading-tight font-bold whitespace-normal hover:underline"
                    onClick={() => searchFor(data.title.title)}
                    title={t("manga.details.searchByTitle")}
                  >
                    {data.title.title}
                  </button>
                </h2>
              </div>
              <div className="flex flex-wrap gap-1">
                {[mangaSources.find((entry) => entry.id === source)?.name, data.release]
                  .filter(Boolean)
                  .map((label) => (
                    <span
                      key={label}
                      className="windows95-small-border bg-secondary text-title-text windows95-text px-1 py-0.5 leading-tight font-bold"
                    >
                      {label}
                    </span>
                  ))}
              </div>
              <DetailPeople
                label={t("manga.details.authors")}
                people={data.authors}
                keys={data.authorKeys}
                role="author"
                searchLabel={t("manga.details.searchByPerson")}
                onSearch={(name, key) => searchFor(name, "author", key)}
              />
              <DetailPeople
                label={t("manga.details.artists")}
                people={data.artists}
                keys={data.artistKeys}
                role="artist"
                searchLabel={t("manga.details.searchByPerson")}
                onSearch={(name, key) => searchFor(name, "artist", key)}
              />
              {data.genres.length > 0 && (
                <ul className="flex flex-wrap gap-1">
                  {[...new Set(data.genres)].map((genre) => (
                    <li
                      key={genre}
                      className="windows95-small-border bg-field px-1 py-0.5 wrap-anywhere"
                    >
                      {genre}
                    </li>
                  ))}
                </ul>
              )}
              {data.description && (
                <Section
                  header={t("anilist.details.description")}
                  className="windows95-text bg-field overflow-y-auto leading-relaxed whitespace-pre-line"
                >
                  <textarea
                    readOnly
                    value={data.description}
                    aria-label={t("anilist.details.description")}
                    className="text-text windows95-text bg-field h-36 max-h-64 min-h-18 w-full resize-y overflow-y-auto text-xs wrap-break-word whitespace-pre-wrap outline-0"
                  />
                </Section>
              )}
            </div>
          </section>
          <section className="windows95-border bg-field flex min-h-0 flex-1 flex-col overflow-hidden">
            <h3 className="bg-secondary text-title-text windows95-text shrink-0 px-1 py-0.5 font-bold">
              {t("manga.details.chapters")}
            </h3>
            <div className="flex min-h-0 flex-1 flex-col gap-1 p-1">
              <TranslationList
                groups={groups}
                source={source}
                hit={data.title}
                onPick={setChapter}
                refreshAction={
                  <Button
                    size="icon"
                    className="size-6 shrink-0"
                    loading={refresh.isPending}
                    aria-label={t("manga.details.refresh")}
                    title={t("manga.details.refresh")}
                    onClick={() => refresh.mutate()}
                  >
                    <RotateCw className="size-3.5" aria-hidden />
                  </Button>
                }
              />
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
}
