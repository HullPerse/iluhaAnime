import { cn } from "cn";
import { useMemo, useState } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import Tabs from "@/components/shared/tabs.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import ImageComponent from "@/components/ui/image.component";
import { Input } from "@/components/ui/input.component";
import Select from "@/components/ui/select.component";
import {
  COMPARE_DIFF_DEFAULT_THRESHOLD,
  COMPARE_LOW_CONFIDENCE_SCORED,
} from "@/config/compare.config";
import { listStatusLabels } from "@/config/labels.config";
import { useI18n } from "@/hooks/i18n.hook";
import {
  buildCompareSummary,
  compareDiff,
  compareVerdict,
  COMPARE_METRICS,
  COMPARE_SORTS,
  filterCompareRows,
  formatNormalizedScore,
  formatSignedDelta,
  formatSignedPercent,
  metricScore,
  sharedFavourites,
  sortCompareRows,
  topGenreTaste,
  type ComparedTitle,
  type CompareDiffKind,
  type CompareMetric,
  type CompareSort,
  type CompareSummary,
  type CompareVerdict,
  type GenreTaste,
  type TasteMatch,
} from "@/lib/compare.utils";
import { getStatusColor } from "@/lib/entries.utils";
import {
  formatMeanScore,
  formatScore,
  parseScoreFormat,
  type AnilistScoreFormat,
} from "@/lib/anilistScore.utils";
import type { TranslationKey } from "@/lib/locale/i18n.utils";
import { toLocaleKey } from "@/lib/locale/key.utils";
import type { AniListCollection, AniUser, AniUserProfile, FavouriteAnime } from "@/types/anilist";

type CompareTab = "shared" | "mine" | "friend";

const TAB_KEYS: Record<"shared" | "mine", TranslationKey> = {
  shared: "anilist.compare.shared",
  mine: "anilist.compare.only.mine",
};

const SORT_KEYS: Record<CompareSort, TranslationKey> = {
  gap: "anilist.compare.sort.gap",
  close: "anilist.compare.sort.close",
  title: "anilist.compare.sort.title",
  mine: "anilist.compare.sort.mine",
  friend: "anilist.compare.sort.friend",
};

const SORTS_BY_TAB: Record<CompareTab, readonly CompareSort[]> = {
  shared: COMPARE_SORTS,
  mine: ["title", "mine"],
  friend: ["title", "friend"],
};

const VERDICT_KEYS: Record<CompareVerdict, TranslationKey> = {
  identical: "anilist.compare.verdict.identical",
  close: "anilist.compare.verdict.close",
  mixed: "anilist.compare.verdict.mixed",
  opposite: "anilist.compare.verdict.opposite",
  unknown: "anilist.compare.verdict.unknown",
};

const CONFIDENCE_KEYS: Record<"medium" | "high", TranslationKey> = {
  medium: "anilist.compare.confidence.medium",
  high: "anilist.compare.confidence.high",
};

const METRIC_KEYS: Record<CompareMetric, TranslationKey> = {
  delta: "anilist.compare.metric.delta",
  iluha: "anilist.compare.metric.iluha",
  mal: "anilist.compare.metric.mal",
};

const DIFF_SYMBOL: Record<CompareDiffKind, string> = {
  same: "=",
  close: "~",
  far: "!",
  unknown: "",
};

const DIFF_CLASS: Record<CompareDiffKind, string> = {
  same: "text-hint",
  close: "text-success",
  far: "text-destructive",
  unknown: "text-hint",
};

const DIFF_BORDER: Record<CompareDiffKind, string> = {
  same: "border-l-hint",
  close: "border-l-success",
  far: "border-l-destructive",
  unknown: "border-l-transparent",
};

const FALLBACK_AVATAR = "/images/user_avatar.ico";

function toProfileProps(
  user: Pick<AniUser, "avatar" | "name" | "anime_count" | "mean_score" | "score_format"> | null,
  fallback: string
): { avatar: string; title: string; subtitle: string } {
  const mean = formatMeanScore(user?.mean_score, parseScoreFormat(user?.score_format));
  return {
    avatar: user?.avatar || FALLBACK_AVATAR,
    title: user?.name ?? fallback,
    subtitle: `${user?.anime_count ?? 0} - ${mean ?? "-"}`,
  };
}

function percent(value: number | null): string {
  return value == null ? "-" : `${value}%`;
}

function ProfileMini({
  avatar,
  title,
  subtitle,
}: {
  avatar: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <ImageComponent
        src={avatar}
        alt={title}
        className="windows95-active-border size-8 shrink-0 object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className="windows95-text truncate text-xs font-bold">{title}</p>
        <p className="windows95-text text-hint text-xs">{subtitle}</p>
      </div>
    </div>
  );
}

function ConfidenceNote({ taste }: { taste: TasteMatch }) {
  const { t } = useI18n();
  if (taste.confidence === "none") {
    return (
      <p className="windows95-text text-hint mt-1 text-xs">{t("anilist.compare.no.scores")}</p>
    );
  }
  if (taste.confidence === "low") {
    return (
      <p className="windows95-text text-destructive mt-1 text-xs">
        {t("anilist.compare.confidence.low", {
          count: taste.scoredCount,
          need: COMPARE_LOW_CONFIDENCE_SCORED,
        })}
      </p>
    );
  }
  return (
    <p className="windows95-text text-hint mt-1 text-xs">
      {t("anilist.compare.confidence.summary", {
        value: t(CONFIDENCE_KEYS[taste.confidence]),
        count: taste.scoredCount,
      })}
    </p>
  );
}

function CompareHero({
  selfUser,
  friendProfile,
  friendName,
  summary,
  metric,
  onMetric,
}: {
  selfUser: AniUser | null;
  friendProfile: AniUserProfile | null;
  friendName: string;
  summary: CompareSummary;
  metric: CompareMetric;
  onMetric: (metric: CompareMetric) => void;
}) {
  const { t } = useI18n();
  const { taste } = summary;
  const verdict = compareVerdict(taste.score);
  const self = toProfileProps(selfUser, t("anilist.compare.me"));
  const friend = toProfileProps(friendProfile, friendName);
  const correlation = taste.spearman == null ? null : Math.round(taste.spearman * 100);
  const meanGap = summary.meanDelta == null ? "-" : (summary.meanDelta / 10).toFixed(1);
  const overlap = summary.libraryOverlap == null ? "-" : `${summary.libraryOverlap}%`;
  const selected = metricScore(metric, summary);
  const selectedText = metric === "mal" ? formatSignedPercent(selected) : percent(selected);
  const metricOptions = useMemo(
    () =>
      COMPARE_METRICS.map((value) => ({
        value,
        label: t(METRIC_KEYS[value]),
      })),
    [t]
  );
  return (
    <div className="p-2">
      <div className="flex items-center gap-2">
        <ProfileMini avatar={self.avatar} title={self.title} subtitle={self.subtitle} />
        <span className="windows95-text text-hint shrink-0 text-xs">VS</span>
        <ProfileMini avatar={friend.avatar} title={friend.title} subtitle={friend.subtitle} />
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <span className="windows95-text text-2xl leading-none font-bold">{selectedText}</span>
        <span className="windows95-text text-hint pb-0.5 text-xs">{t(METRIC_KEYS[metric])}</span>
      </div>
      <div className="mt-1 flex items-center gap-1">
        <span className="windows95-text text-hint text-xs">{t("anilist.compare.metric")}</span>
        <Select
          value={metric}
          onChange={(value) => onMetric(value as CompareMetric)}
          options={metricOptions}
          label={t("anilist.compare.metric")}
          className="min-w-0 flex-1"
        />
      </div>
      <p
        className="windows95-text text-hint mt-1 text-xs"
        title={[
          t("anilist.compare.component.gap", { value: percent(taste.gapScore) }),
          t("anilist.compare.component.rank", { value: percent(taste.rankScore) }),
          t("anilist.compare.component.direction", {
            value: percent(taste.directionScore),
          }),
          t("anilist.compare.direction.hint", {
            agree: taste.agree,
            split: taste.split,
            neutral: taste.neutral,
          }),
        ].join(" | ")}
      >
        {t("anilist.compare.match")}: {percent(taste.score)}
        {taste.score == null ? "" : ` (${t(VERDICT_KEYS[verdict])})`}
      </p>
      <p className="windows95-text text-hint text-xs">
        {t("anilist.compare.shared.total", { count: summary.shared.length })}
        {" | "}
        {t("anilist.compare.scored.count", { count: summary.sharedScoredCount })}
        {" | "}
        {t("anilist.compare.overlap", { value: overlap })}
      </p>
      <p className="windows95-text text-hint text-xs">
        {t("anilist.compare.mean.gap.short", { value: meanGap })}
        {" | "}
        {t("anilist.compare.correlation", { value: formatSignedPercent(correlation) })}
      </p>
      <ConfidenceNote taste={taste} />
    </div>
  );
}

function CompareTabs({
  tab,
  summary,
  friendName,
  onTab,
}: {
  tab: CompareTab;
  summary: CompareSummary;
  friendName: string;
  onTab: (tab: CompareTab) => void;
}) {
  const { t } = useI18n();
  const tabs = [
    {
      id: "shared" as const,
      label: `${t(TAB_KEYS.shared)} (${summary.shared.length})`,
    },
    {
      id: "mine" as const,
      label: `${t(TAB_KEYS.mine)} (${summary.onlyMine.length})`,
    },
    {
      id: "friend" as const,
      label: `${t("anilist.compare.only.name", { name: friendName })} (${summary.onlyFriend.length})`,
    },
  ];
  return (
    <div className="shrink-0 border-t border-black/20 p-2">
      <Tabs ariaLabel={t("anilist.compare.compare")} tabs={tabs} activeTab={tab} onChange={onTab} />
    </div>
  );
}

function CompareToolbar({
  query,
  sort,
  sortOptions,
  diffMode,
  onQuery,
  onSort,
  onDiffMode,
}: {
  query: string;
  sort: CompareSort;
  sortOptions: { value: CompareSort; label: string }[];
  diffMode: boolean;
  onQuery: (query: string) => void;
  onSort: (sort: CompareSort) => void;
  onDiffMode: (enabled: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="border-t border-black/20 p-2">
      <Input
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        placeholder={t("anilist.compare.search")}
        aria-label={t("anilist.compare.search")}
      />
      <div className="mt-1 flex items-center gap-1">
        <Select
          value={sort}
          onChange={(value) => onSort(value as CompareSort)}
          options={sortOptions}
          label={t("anilist.compare.sort")}
          className="min-w-0 flex-1"
        />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Checkbox
            checked={diffMode}
            onChange={onDiffMode}
            aria-label={t("anilist.compare.diff.mode")}
          />
          <span className="windows95-text text-xs">{t("anilist.compare.diff.mode")}</span>
        </div>
      </div>
    </div>
  );
}

function StatusMark({ status }: { status: string }) {
  const { t } = useI18n();
  if (!status) return <span className="size-2 shrink-0" aria-hidden />;
  const normalized = status.toUpperCase();
  const key = listStatusLabels[normalized];
  const label = key ? t(toLocaleKey(key)) : status;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="windows95-small-border inline-block size-2 shrink-0"
      style={{ backgroundColor: getStatusColor(normalized) }}
    />
  );
}

function ScoreCell({
  score,
  raw,
  format,
  status,
  progress,
  episodes,
  rawLabel,
}: {
  score: number | null;
  raw: number | null;
  format: AnilistScoreFormat;
  status: string;
  progress: number | null;
  episodes: number | null;
  rawLabel: string;
}) {
  const { t } = useI18n();
  const rawScore = formatScore(raw, format);
  return (
    <div
      className="flex min-w-0 flex-col items-end gap-0.5"
      title={
        raw == null
          ? undefined
          : t("anilist.compare.score.raw", { label: rawLabel, score: rawScore })
      }
    >
      <span className="windows95-text text-xs font-bold">{formatNormalizedScore(score)}</span>
      <StatusMark status={status} />
      {progress != null && (
        <span className="windows95-text text-hint text-xs">
          {episodes == null ? progress : `${progress}/${episodes}`}
        </span>
      )}
    </div>
  );
}

function RowContent({
  row,
  tab,
  myFormat,
  friendFormat,
  friendName,
  diffKind,
}: {
  row: ComparedTitle;
  tab: CompareTab;
  myFormat: AnilistScoreFormat;
  friendFormat: AnilistScoreFormat;
  friendName: string;
  diffKind: CompareDiffKind;
}) {
  const { t } = useI18n();
  const altTitle = row.titles.find((title) => title !== row.title);
  const absoluteDelta = row.signedDelta == null ? "-" : (Math.abs(row.signedDelta) / 10).toFixed(1);
  const deltaTitle =
    row.signedDelta == null
      ? undefined
      : row.signedDelta > 0
        ? t("anilist.compare.diff.up", {
            value: absoluteDelta,
          })
        : row.signedDelta < 0
          ? t("anilist.compare.diff.down", {
              name: friendName,
              value: absoluteDelta,
            })
          : t("anilist.compare.diff.equal");
  return (
    <>
      {row.coverUrl ? (
        <ImageComponent
          src={row.coverUrl}
          alt=""
          className="windows95-active-border h-11 w-8 shrink-0 object-cover"
        />
      ) : (
        <span className="h-11 w-8 shrink-0" aria-hidden />
      )}
      <div className="min-w-0">
        <p className="windows95-text truncate text-xs">{row.title}</p>
        {altTitle && <p className="windows95-text text-hint truncate text-xs">{altTitle}</p>}
      </div>
      <ScoreCell
        score={row.mine}
        raw={row.mineRaw}
        format={myFormat}
        status={row.myStatus}
        progress={tab === "shared" ? null : row.myProgress}
        episodes={row.episodes}
        rawLabel={t("anilist.compare.you.short")}
      />
      <ScoreCell
        score={row.friend}
        raw={row.friendRaw}
        format={friendFormat}
        status={row.friendStatus}
        progress={tab === "shared" ? null : row.friendProgress}
        episodes={row.episodes}
        rawLabel={friendName}
      />
      <div className="flex min-w-0 flex-col items-end" title={deltaTitle}>
        <span
          className={cn(
            "windows95-text inline-block max-w-full truncate px-1 text-xs",
            DIFF_CLASS[diffKind]
          )}
        >
          {DIFF_SYMBOL[diffKind] ? `${DIFF_SYMBOL[diffKind]} ` : ""}
          {formatSignedDelta(row.signedDelta)}
        </span>
      </div>
    </>
  );
}

function TitleRow({
  row,
  tab,
  myFormat,
  friendFormat,
  friendName,
  diffMode,
  onAnimeClick,
}: {
  row: ComparedTitle;
  tab: CompareTab;
  myFormat: AnilistScoreFormat;
  friendFormat: AnilistScoreFormat;
  friendName: string;
  diffMode: boolean;
  onAnimeClick?: (id: number) => void;
}) {
  const diffKind: CompareDiffKind = diffMode
    ? compareDiff(row.delta == null ? null : row.delta / 10, COMPARE_DIFF_DEFAULT_THRESHOLD)
    : "unknown";
  const className = cn(
    "grid w-full grid-cols-[2rem_minmax(0,1fr)_3.25rem_3.25rem_3.5rem] items-center gap-1 px-1 py-1.5 text-left",
    diffMode && "border-l-2",
    diffMode && DIFF_BORDER[diffKind],
    onAnimeClick ? "hover:bg-surface cursor-pointer bg-transparent" : ""
  );
  const content = (
    <RowContent
      row={row}
      tab={tab}
      myFormat={myFormat}
      friendFormat={friendFormat}
      friendName={friendName}
      diffKind={diffKind}
    />
  );
  if (!onAnimeClick) return <div className={className}>{content}</div>;
  return (
    <button
      type="button"
      title={row.title}
      onClick={() => onAnimeClick(row.id)}
      className={className}
    >
      {content}
    </button>
  );
}

function EmptyRows({
  tab,
  query,
  friendName,
  onClear,
}: {
  tab: CompareTab;
  query: string;
  friendName: string;
  onClear: () => void;
}) {
  const { t } = useI18n();
  if (query.trim()) {
    return (
      <div className="flex flex-col items-center gap-1 p-3">
        <p className="windows95-text text-hint text-center text-xs">
          {t("anilist.compare.no.match")}
        </p>
        <Button variant="outline" className="h-6 text-xs" onClick={onClear}>
          {t("anilist.compare.clear")}
        </Button>
      </div>
    );
  }
  const label =
    tab === "shared"
      ? t("anilist.compare.no.shared")
      : tab === "mine"
        ? t("anilist.compare.no.mine.titles")
        : t("anilist.compare.no.friend.titles", { name: friendName });
  return <p className="windows95-text text-hint p-3 text-center text-xs">{label}</p>;
}

function TitleRows({
  rows,
  tab,
  query,
  myFormat,
  friendFormat,
  friendName,
  diffMode,
  onClear,
  onAnimeClick,
}: {
  rows: ComparedTitle[];
  tab: CompareTab;
  query: string;
  myFormat: AnilistScoreFormat;
  friendFormat: AnilistScoreFormat;
  friendName: string;
  diffMode: boolean;
  onClear: () => void;
  onAnimeClick?: (id: number) => void;
}) {
  const { t } = useI18n();
  const [showAll, setShowAll] = useState(false);
  if (rows.length === 0) {
    return (
      <div className="border-t border-black/20">
        <EmptyRows tab={tab} query={query} friendName={friendName} onClear={onClear} />
      </div>
    );
  }
  const visible = showAll ? rows : rows.slice(0, 60);
  return (
    <div className="border-t border-black/20 p-1">
      <div className="text-hint grid w-full grid-cols-[2rem_minmax(0,1fr)_3.25rem_3.25rem_3.5rem] items-center gap-1 px-1 text-xs">
        <span />
        <span />
        <span className="text-right">{t("anilist.compare.you.short")}</span>
        <span className="truncate text-right">{friendName}</span>
        <span className="text-right">{t("anilist.compare.delta.short")}</span>
      </div>
      {visible.map((row) => (
        <TitleRow
          key={row.id}
          row={row}
          tab={tab}
          myFormat={myFormat}
          friendFormat={friendFormat}
          friendName={friendName}
          diffMode={diffMode}
          onAnimeClick={onAnimeClick}
        />
      ))}
      {rows.length > 60 && (
        <Button
          variant="outline"
          className="mt-1 h-6 text-xs"
          onClick={() => setShowAll((value) => !value)}
        >
          {showAll
            ? t("anilist.compare.show.less")
            : t("anilist.compare.show.more", { count: rows.length - 60 })}
        </Button>
      )}
    </div>
  );
}

function GenreSection({ genres, friendName }: { genres: GenreTaste[]; friendName: string }) {
  const { t } = useI18n();
  if (genres.length === 0) return null;
  return (
    <div className="border-t border-black/20 p-2">
      <p className="windows95-text mb-1 text-xs font-bold">{t("anilist.compare.genres.taste")}</p>
      <div className="text-hint grid grid-cols-[minmax(0,1fr)_4rem_4rem_2.5rem] gap-1 text-xs">
        <span />
        <span className="text-right">{t("anilist.compare.you.short")}</span>
        <span className="truncate text-right">{friendName}</span>
        <span className="text-right">{t("anilist.compare.delta.short")}</span>
      </div>
      {genres.map((genre) => (
        <div
          key={genre.genre}
          className="grid grid-cols-[minmax(0,1fr)_4rem_4rem_2.5rem] items-center gap-1 text-xs"
        >
          <span className="windows95-text truncate">
            {genre.genre}{" "}
            <span className="text-hint">
              ({genre.mineCount}/{genre.friendCount})
            </span>
          </span>
          <span className="windows95-text text-right">{formatNormalizedScore(genre.mine)}</span>
          <span className="windows95-text text-right">{formatNormalizedScore(genre.friend)}</span>
          <span className="windows95-text text-hint text-right">
            {formatSignedDelta(genre.delta)}
          </span>
        </div>
      ))}
    </div>
  );
}

function FavsSection({
  favourites,
  onAnimeClick,
}: {
  favourites: FavouriteAnime[];
  onAnimeClick?: (id: number) => void;
}) {
  const { t } = useI18n();
  if (favourites.length === 0) return null;
  return (
    <div className="border-t border-black/20 p-2">
      <p className="windows95-text mb-1 text-xs font-bold">
        {t("anilist.compare.common.favs")} ({favourites.length})
      </p>
      <div className="flex flex-wrap gap-1">
        {favourites.slice(0, 12).map((item) => {
          const content = (
            <>
              {item.cover_image?.medium && (
                <ImageComponent
                  src={item.cover_image.medium}
                  alt={item.title.romaji}
                  className="windows95-active-border h-13 w-10 object-cover"
                />
              )}
              <p className="windows95-text truncate text-center text-xs">{item.title.romaji}</p>
            </>
          );
          return onAnimeClick ? (
            <button
              key={item.id}
              type="button"
              title={item.title.romaji}
              onClick={() => onAnimeClick(item.id)}
              className="hover:bg-surface w-10 cursor-pointer border-0 bg-transparent p-0"
            >
              {content}
            </button>
          ) : (
            <div key={item.id} title={item.title.romaji} className="w-10">
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CompareAnilist({
  selfUser,
  selfLists,
  selfFavourites,
  friendProfile,
  friendName,
  friendLists,
  friendFavourites,
  listsLoading,
  listsError,
  onRetry,
  onAnimeClick,
}: {
  selfUser: AniUser | null;
  selfLists: AniListCollection[];
  selfFavourites: FavouriteAnime[];
  friendProfile: AniUserProfile | null;
  friendName: string;
  friendLists: AniListCollection[];
  friendFavourites: FavouriteAnime[];
  listsLoading: boolean;
  listsError: string | null;
  onRetry: () => void;
  onAnimeClick?: (id: number) => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<CompareTab>("shared");
  const [metric, setMetric] = useState<CompareMetric>("iluha");
  const [sort, setSort] = useState<CompareSort>("gap");
  const [query, setQuery] = useState("");
  const [diffMode, setDiffMode] = useState(false);

  const myFormat = parseScoreFormat(selfUser?.score_format);
  const friendFormat = parseScoreFormat(friendProfile?.score_format);
  const summary = useMemo(
    () => buildCompareSummary(selfLists, friendLists, myFormat, friendFormat),
    [selfLists, friendLists, myFormat, friendFormat]
  );
  const genres = useMemo(
    () => topGenreTaste(selfLists, friendLists, myFormat, friendFormat),
    [selfLists, friendLists, myFormat, friendFormat]
  );
  const commonFavs = useMemo(
    () => sharedFavourites(selfFavourites, friendFavourites),
    [selfFavourites, friendFavourites]
  );
  const rows =
    tab === "shared" ? summary.shared : tab === "mine" ? summary.onlyMine : summary.onlyFriend;
  const sortOptions = useMemo(
    () =>
      SORTS_BY_TAB[tab].map((value) => ({
        value,
        label: t(SORT_KEYS[value], { name: friendName }),
      })),
    [tab, t, friendName]
  );
  const effectiveSort = sortOptions.some((option) => option.value === sort)
    ? sort
    : (sortOptions[0]?.value ?? "title");
  const filteredRows = useMemo(
    () => sortCompareRows(filterCompareRows(rows, query), effectiveSort),
    [rows, query, effectiveSort]
  );

  if (listsLoading && friendLists.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <SmallLoader size={5} />
      </div>
    );
  }
  if (listsError && friendLists.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6">
        <span className="windows95-text text-destructive text-center text-xs">{listsError}</span>
        <Button onClick={onRetry}>{t("anilist.activity.retry")}</Button>
      </div>
    );
  }

  return (
    <div className="windows95-border bg-field flex min-h-0 flex-1 flex-col overflow-y-auto">
      <CompareHero
        selfUser={selfUser}
        friendProfile={friendProfile}
        friendName={friendName}
        summary={summary}
        metric={metric}
        onMetric={setMetric}
      />
      <CompareTabs tab={tab} summary={summary} friendName={friendName} onTab={setTab} />
      <CompareToolbar
        query={query}
        sort={effectiveSort}
        sortOptions={sortOptions}
        diffMode={diffMode}
        onQuery={setQuery}
        onSort={setSort}
        onDiffMode={setDiffMode}
      />
      <TitleRows
        key={`${tab}:${effectiveSort}:${query}`}
        rows={filteredRows}
        tab={tab}
        query={query}
        myFormat={myFormat}
        friendFormat={friendFormat}
        friendName={friendName}
        diffMode={diffMode}
        onClear={() => setQuery("")}
        onAnimeClick={onAnimeClick}
      />
      <GenreSection genres={genres} friendName={friendName} />
      <FavsSection favourites={commonFavs} onAnimeClick={onAnimeClick} />
    </div>
  );
}
