import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCell } from "@hullperse/hp_utils/react";
import { reportBackgroundError } from "@hullperse/hp_utils/attempt";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Link } from "@tanstack/react-router";
import { openTrackedManga } from "@/store/anilistManga.store";
import {
  Check,
  Copy,
  ExternalLink,
  Info,
  ListChecks,
  Lock,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import type { ReactNode } from "react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import {
  getMangaCachedDetails,
  getMangaReads,
  mangaLibraryKey,
  mangaSources,
  mangaReadKeys,
  refreshMangaChapters,
  setMangaChaptersRead,
} from "@/api/manga.api";
import type {
  MangaChapter,
  MangaHit,
  MangaPersonRole,
  MangaReaderInput,
  MangaSource,
} from "@/api/manga.api";
import ContextMenu from "@/components/shared/contextMenu.component";
import Modal from "@/components/shared/modal.component";
import Section from "@/components/shared/section.component";
import { SmallLoader } from "@/components/shared/loader/small.loader";
import { Button } from "@/components/ui/button.component";
import Select from "@/components/ui/select.component";
import { QUERY_PRESETS } from "@/config/system/query.config";
import { useI18n } from "@/hooks/i18n.hook";
import { buildMangaLink } from "@/lib/core/system/deeplink.utils";
import { mangaTitleUrl } from "@/lib/manga/sourcePage.utils";
import { readerChapter, translationId } from "@/lib/manga/readerChapter.utils";
import MangaReader from "@/routes/components/manga/reader.manga";
import { MangaCover } from "@/routes/components/manga/cover.manga";
import SaveManga from "@/routes/components/manga/save.manga";
import { HeaderAction } from "@/routes/components/stream/detail/headerAction.detail";
import { searchLocalManga } from "@/store/manga.store";
import { patchSettings, settingsAtoms } from "@/store/settings.store";

function groupChapters(chapters: MangaChapter[]) {
  const groups = new Map<string, MangaChapter[]>();
  for (const chapter of chapters) {
    const group = groups.get(chapter.key);
    if (group) group.push(chapter);
    else groups.set(chapter.key, [chapter]);
  }
  return [...groups.values()];
}

function translationOptions(groups: readonly (readonly MangaChapter[])[], noGroup: string) {
  const options = new Map<string, { value: string; label: string; count: number }>();
  for (const rows of groups) {
    const counted = new Set<string>();
    for (const row of rows) {
      const value = translationId(row);
      if (counted.has(value)) continue;
      counted.add(value);

      const option = options.get(value);
      if (option) option.count += 1;
      else {
        options.set(value, {
          value,
          label: `${row.language.toUpperCase()} - ${row.group ?? noGroup}`,
          count: 1,
        });
      }
    }
  }

  return [...options.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, "ru")
  );
}

function TranslationList({
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

function ChapterList({
  groups,
  translation,
  reads,
  pendingKeys,
  ready,
  onMark,
  onPick,
}: {
  groups: MangaChapter[][];
  translation: string;
  reads: Set<string>;
  pendingKeys: Set<string>;
  ready: boolean;
  onMark: (keys: string[], read: boolean) => void;
  onPick: (chapter: MangaChapter) => void;
}) {
  return (
    <ul className="divide-muted windows95-border divide-y">
      {groups.map((rows, index) => {
        const chapter = rows[0];
        if (!chapter) return null;
        const lower = Number(groups[index + 1]?.[0]?.number ?? Number.NaN);
        const upper = Number(chapter.number || Number.NaN);
        const translations = rows.filter((row) => translationId(row) === translation);
        return (
          <ChapterRow
            key={chapter.key}
            chapter={chapter}
            selected={translations.find((row) => !row.locked) ?? translations[0]}
            gap={Math.ceil(upper) - Math.floor(lower) > 1}
            read={reads.has(chapter.key)}
            pending={!ready || pendingKeys.has(chapter.key)}
            previousKeys={
              index < groups.length - 1
                ? groups.slice(index + 1).flatMap((rows) => (rows[0] ? [rows[0].key] : []))
                : undefined
            }
            onMark={onMark}
            onPick={onPick}
          />
        );
      })}
    </ul>
  );
}

function ChapterRow({
  chapter,
  selected,
  gap,
  read,
  pending,
  previousKeys,
  onMark,
  onPick,
}: {
  chapter: MangaChapter;
  selected?: MangaChapter;
  gap: boolean;
  read: boolean;
  pending: boolean;
  previousKeys?: string[];
  onMark: (keys: string[], read: boolean) => void;
  onPick: (chapter: MangaChapter) => void;
}) {
  const { t } = useI18n();
  const openable = selected !== undefined && !selected.locked;
  const dimmed = !openable || read;
  const lockLabel =
    selected?.locked === true
      ? [
          t(`manga.details.lock.${selected.lockReason ?? "closed"}`),
          selected.availableAt?.slice(0, 10),
        ]
          .filter(Boolean)
          .join(" - ")
      : null;
  const openChapter = () => {
    if (selected && !selected.locked) onPick(selected);
  };
  return (
    <li
      title={selected === undefined ? t("manga.details.translationMissing") : undefined}
      className="[contain-intrinsic-block-size:auto_2.5rem] [content-visibility:auto]"
    >
      <ChapterReadMenu
        read={read}
        pending={pending}
        onToggle={() => onMark([chapter.key], !read)}
        onMarkPrevious={previousKeys ? () => onMark(previousKeys, true) : undefined}
      >
        <div
          role="button"
          tabIndex={0}
          aria-disabled={!openable}
          className={`data-available:hover:bg-primary flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2 py-1${openable ? " group focus-visible:outline-text cursor-pointer focus-visible:outline-1 focus-visible:-outline-offset-2 focus-visible:outline-dotted" : ""}`}
          data-available={openable ? "" : undefined}
          onClick={openChapter}
          onKeyDown={(event) => {
            if (!openable) return;
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            openChapter();
          }}
        >
          <div className="flex min-w-[min(100%,10rem)] flex-1 flex-col">
            <span
              className={`${dimmed ? "text-hint" : "font-bold"}${openable ? " group-hover:underline" : ""}`}
            >
              {chapter.number
                ? t("manga.details.chapter", { number: chapter.number })
                : t("manga.details.special")}
            </span>
            {chapter.title && (
              <span
                className={`text-hint wrap-anywhere${openable ? " group-hover:underline" : ""}`}
              >
                {chapter.title}
              </span>
            )}
          </div>
          {lockLabel !== null && (
            <span className="text-hint ml-auto" title={lockLabel} aria-label={lockLabel}>
              <Lock className="size-3" aria-hidden />
            </span>
          )}
        </div>
      </ChapterReadMenu>
      {gap && <p className="text-hint px-2 pb-1">{t("manga.details.gap")}</p>}
    </li>
  );
}

function ChapterReadMenu({
  read,
  pending,
  onToggle,
  onMarkPrevious,
  children,
}: {
  read: boolean;
  pending: boolean;
  onToggle: () => void;
  onMarkPrevious?: () => void;
  children: ReactNode;
}) {
  const toggleLabel = read ? "manga.details.markUnread" : "manga.details.markRead";
  return (
    <ContextMenu
      className="[&_[role=menuitem]]:py-0.5 [&_[role=menuitem]]:text-[max(10px,calc(var(--ui-font-size)-1px))]! [&_[role=menuitem]>span:first-child]:hidden"
      entries={[
        {
          kind: "item",
          id: "toggle-read",
          label: toggleLabel,
          icon: read ? RotateCcw : Check,
          onSelect: onToggle,
          disabled: pending,
        },
        {
          kind: "item",
          id: "mark-previous",
          label: "manga.details.markPreviousRead",
          icon: ListChecks,
          onSelect: () => onMarkPrevious?.(),
          disabled: pending || !onMarkPrevious,
        },
      ]}
    >
      {children}
    </ContextMenu>
  );
}

function MangaHeaderActions({
  source,
  id,
  hit,
  onClose,
}: {
  source: MangaSource;
  id: string;
  hit?: MangaHit;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const browserDomain = useCell(settingsAtoms.mangaLibBrowserDomain);
  const website = mangaTitleUrl(source, hit?.id ?? id, browserDomain);
  return (
    <>
      {website && (
        <HeaderAction
          title={t("manga.details.openSourcePage")}
          icon={<ExternalLink className="size-2.5" aria-hidden />}
          onClick={() => {
            openUrl(website).catch((error: unknown) =>
              reportBackgroundError("manga.source-page", error)
            );
          }}
        />
      )}
      <HeaderAction
        title={t("manga.details.copyLink")}
        icon={<Copy className="size-2.5" aria-hidden />}
        onClick={() => {
          writeText(buildMangaLink({ source, id: hit?.id ?? id })).catch((error: unknown) =>
            reportBackgroundError("manga.copy-link", error)
          );
        }}
      />
      {hit && <MangaAniListButton hit={hit} onClose={onClose} />}
    </>
  );
}

function MangaAniListButton({ hit, onClose }: { hit: MangaHit; onClose: () => void }) {
  const { t } = useI18n();
  const id = hit.externalIds.anilist;
  if (id == null || !Number.isSafeInteger(id) || id <= 0) return null;

  return (
    <Button
      render={<Link to="/anilist" />}
      nativeButton={false}
      size="icon"
      className="size-5"
      title={t("collection.detail.open.anilist")}
      aria-label={t("collection.detail.open.anilist")}
      onClick={() => {
        openTrackedManga(id, hit.title);
        onClose();
      }}
    >
      <Info className="size-2.5" aria-hidden />
    </Button>
  );
}

function DetailPeople({
  label,
  people,
  keys,
  role,
  searchLabel,
  onSearch,
}: {
  label: string;
  people: string[];
  keys?: string[];
  role: MangaPersonRole;
  searchLabel: string;
  onSearch: (value: string, key?: string) => void;
}) {
  const unique = new Map<string, string>();
  for (const [index, person] of people.entries()) {
    const name = person.trim();
    if (name && !unique.has(name)) unique.set(name, keys?.[index] ?? "");
  }
  if (unique.size === 0) return null;
  return (
    <dl className="flex flex-wrap items-center gap-x-2">
      <dt className="text-hint">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-x-1 wrap-anywhere" data-role={role}>
        {[...unique.entries()].map(([person, key], index) => (
          <Fragment key={person}>
            {index > 0 && <span aria-hidden>,</span>}
            <button
              type="button"
              className="windows95-text text-text cursor-pointer border-0 bg-transparent p-0 text-left leading-tight whitespace-normal hover:underline"
              onClick={() => onSearch(person, key || undefined)}
              title={searchLabel}
            >
              {person}
            </button>
          </Fragment>
        ))}
      </dd>
    </dl>
  );
}

function useMangaDetailData(source: MangaSource, id: string, nsfw: boolean) {
  const client = useQueryClient();
  const requestDomain = useCell(settingsAtoms.mangaLibRequestDomain);
  const detailsKey = [
    "manga",
    "details",
    source,
    id,
    nsfw,
    source === "mangalib" ? requestDomain : null,
  ] as const;
  const cachedKey = ["manga", "cached", source, id] as const;
  const cached = useQuery({
    queryKey: cachedKey,
    queryFn: () => getMangaCachedDetails(source, id),
    ...QUERY_PRESETS.static,
    retry: false,
  });
  const fresh = useQuery({
    queryKey: detailsKey,
    queryFn: async () => {
      const result = await refreshMangaChapters(source, id, nsfw);
      client.setQueryData(cachedKey, result);
      await client.invalidateQueries({ queryKey: mangaLibraryKey });
      return result;
    },
    ...QUERY_PRESETS.slow,
    retry: false,
  });
  const refresh = useMutation({
    mutationFn: () => refreshMangaChapters(source, id, nsfw),
    onSuccess: async (result) => {
      client.setQueryData(detailsKey, result);
      client.setQueryData(cachedKey, result);
      await client.invalidateQueries({ queryKey: mangaLibraryKey });
    },
  });
  const data = fresh.data ?? cached.data ?? undefined;
  return {
    data,
    error: fresh.error,
    isPending: !data && (fresh.isPending || cached.isPending),
    refetch: fresh.refetch,
    refresh,
  };
}

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
  const [missingChapter, setMissingChapter] = useState(false);
  const visitedHistory = useRef(false);
  const { data, error, isPending, refetch, refresh } = useMangaDetailData(source, id, nsfw);
  const groups = useMemo(() => groupChapters(data?.chapters ?? []), [data]);
  const reading = chapter !== null && data !== undefined;
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
  if (chapter && data) {
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
