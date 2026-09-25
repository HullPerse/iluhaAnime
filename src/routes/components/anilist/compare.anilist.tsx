import { cn } from "cn";
import { useMemo, useState } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import Select from "@/components/ui/select.component";
import {
  buildCompareSummary,
  COMPARE_METRICS,
  sharedFavourites,
  topGenreOverlap,
  type ComparedTitle,
  type CompareMetric,
  type GenreOverlap,
} from "@/lib/anilist/compare.utils";
import {
  formatMeanScore,
  formatScore,
  parseScoreFormat,
  type AnilistScoreFormat,
} from "@/lib/anilist/score.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { TranslationKey } from "@/lib/locale/i18n.utils";
import type { AniListCollection, AniUser, AniUserProfile, FavouriteAnime } from "@/types/anilist";

type CompareTab = "shared" | "mine" | "friend";

const TAB_KEYS: Record<CompareTab, TranslationKey> = {
  shared: "anilist.compare.shared",
  mine: "anilist.compare.only.mine",
  friend: "anilist.compare.only.friend",
};

type Summary = ReturnType<typeof buildCompareSummary>;

function metricValue(metric: CompareMetric, summary: Summary): string {
  if (metric === "mal") {
    if (summary.malAffinity == null) return "-";
    const sign = summary.malAffinity > 0 ? "+" : "";
    return `${sign}${summary.malAffinity}%`;
  }
  if (metric === "delta") return summary.deltaScore == null ? "-" : String(summary.deltaScore);
  return summary.iluhaAffinity == null ? "-" : String(summary.iluhaAffinity);
}

const FALLBACK_AVATAR = "/images/user_avatar.ico";

function toMiniProps(
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
        className="windows95-active-border size-8 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className="windows95-text truncate text-xs font-bold">{title}</p>
        <p className="windows95-text text-hint text-xs">{subtitle}</p>
      </div>
    </div>
  );
}

function VersusHeader({
  selfUser,
  friendProfile,
}: {
  selfUser: AniUser | null;
  friendProfile: AniUserProfile | null;
}) {
  const { t } = useI18n();
  const self = toMiniProps(selfUser, t("anilist.compare.me"));
  const friend = toMiniProps(friendProfile, "");
  return (
    <div className="flex items-center gap-2 p-2">
      <ProfileMini avatar={self.avatar} title={self.title} subtitle={self.subtitle} />
      <span className="windows95-text text-hint shrink-0 text-xs">VS</span>
      <ProfileMini avatar={friend.avatar} title={friend.title} subtitle={friend.subtitle} />
    </div>
  );
}

function MetricSection({
  summary,
  metric,
  onMetric,
}: {
  summary: Summary;
  metric: CompareMetric;
  onMetric: (metric: CompareMetric) => void;
}) {
  const { t } = useI18n();
  const options = useMemo(
    () =>
      COMPARE_METRICS.map((value) => ({
        value,
        label: t(`anilist.compare.metric.${value}`),
      })),
    [t]
  );
  return (
    <div className="border-t border-black/20 p-2">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <span className="windows95-text text-hint text-xs">{t("anilist.compare.metric")}</span>
          <Select
            value={metric}
            onChange={(value) => onMetric(value as CompareMetric)}
            options={options}
            label={t("anilist.compare.metric")}
          />
        </div>
        <div className="shrink-0 text-right">
          <p className="windows95-text text-2xl font-bold">{metricValue(metric, summary)}</p>
        </div>
      </div>
      <p className="windows95-text text-hint mt-1 text-xs">
        {t("anilist.compare.shared.count", {
          shared: summary.shared.length,
          mine: summary.onlyMine.length,
          friend: summary.onlyFriend.length,
        })}
      </p>
      {summary.meanDelta != null && (
        <p className="windows95-text text-hint text-xs">
          {t("anilist.compare.mean.delta", { value: summary.meanDelta })}
        </p>
      )}
      {summary.lowConfidence && summary.sharedScoredCount > 0 && (
        <p className="windows95-text text-hint text-xs">
          {t("anilist.compare.low.confidence", { count: summary.sharedScoredCount })}
        </p>
      )}
    </div>
  );
}

function CompareTabBar({ tab, onTab }: { tab: CompareTab; onTab: (tab: CompareTab) => void }) {
  const { t } = useI18n();
  return (
    <div className="flex gap-1 border-t border-black/20 p-2">
      {(Object.keys(TAB_KEYS) as CompareTab[]).map((value) => (
        <Button
          key={value}
          size="default"
          variant={tab === value ? "secondary" : "outline"}
          className={cn("min-w-0 flex-1", tab === value && "font-bold")}
          onClick={() => onTab(value)}
        >
          <span className="windows95-text truncate text-xs">{t(TAB_KEYS[value])}</span>
        </Button>
      ))}
    </div>
  );
}

function TitleRow({
  row,
  myFormat,
  friendFormat,
}: {
  row: ComparedTitle;
  myFormat: AnilistScoreFormat;
  friendFormat: AnilistScoreFormat;
}) {
  const { t } = useI18n();
  const mine = row.mineRaw == null ? "-" : formatScore(row.mineRaw, myFormat);
  const friend = row.friendRaw == null ? "-" : formatScore(row.friendRaw, friendFormat);
  return (
    <div className="hover:bg-surface flex items-center gap-1 p-1">
      {row.coverUrl && (
        <ImageComponent
          src={row.coverUrl}
          alt=""
          className="windows95-active-border h-11 w-8 shrink-0 object-cover"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="windows95-text truncate text-xs">{row.title}</p>
        <p className="windows95-text text-hint text-xs">
          {mine} - {friend}
          {row.delta != null && ` (${t("anilist.compare.diff", { value: row.delta })})`}
        </p>
      </div>
    </div>
  );
}

function TitleRows({
  rows,
  tab,
  myFormat,
  friendFormat,
}: {
  rows: ComparedTitle[];
  tab: CompareTab;
  myFormat: AnilistScoreFormat;
  friendFormat: AnilistScoreFormat;
}) {
  const { t } = useI18n();
  if (rows.length === 0) {
    return (
      <div className="border-t border-black/20 p-1">
        <p className="windows95-text text-hint p-3 text-center text-xs">
          {tab === "shared" ? t("anilist.compare.no.shared") : t("anilist.compare.no.titles")}
        </p>
      </div>
    );
  }
  return (
    <div className="border-t border-black/20 p-1">
      {rows.slice(0, 60).map((row) => (
        <TitleRow key={row.id} row={row} myFormat={myFormat} friendFormat={friendFormat} />
      ))}
    </div>
  );
}

function GenreSection({ genres }: { genres: GenreOverlap[] }) {
  const { t } = useI18n();
  if (genres.length === 0) return null;
  return (
    <div className="border-t border-black/20 p-2">
      <p className="windows95-text mb-1 text-xs font-bold">{t("anilist.compare.genres")}</p>
      {genres.map((genre) => (
        <p key={genre.genre} className="windows95-text text-hint text-xs">
          {genre.genre}: {genre.mine} - {genre.friend}
        </p>
      ))}
    </div>
  );
}

function FavsSection({ favourites }: { favourites: FavouriteAnime[] }) {
  const { t } = useI18n();
  if (favourites.length === 0) return null;
  return (
    <div className="border-t border-black/20 p-2">
      <p className="windows95-text mb-1 text-xs font-bold">{t("anilist.compare.common.favs")}</p>
      <div className="flex flex-wrap gap-1">
        {favourites.slice(0, 12).map((item) => (
          <div key={item.id} title={item.title.romaji} className="w-10">
            {item.cover_image?.medium && (
              <ImageComponent
                src={item.cover_image.medium}
                alt={item.title.romaji}
                className="windows95-active-border h-13 w-10 object-cover"
              />
            )}
            <p className="windows95-text truncate text-center text-xs">{item.title.romaji}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CompareAnilist({
  selfUser,
  selfLists,
  selfFavourites,
  friendProfile,
  friendLists,
  friendFavourites,
  listsLoading,
  listsError,
  onRetry,
}: {
  selfUser: AniUser | null;
  selfLists: AniListCollection[];
  selfFavourites: FavouriteAnime[];
  friendProfile: AniUserProfile | null;
  friendLists: AniListCollection[];
  friendFavourites: FavouriteAnime[];
  listsLoading: boolean;
  listsError: string | null;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const [metric, setMetric] = useState<CompareMetric>("iluha");
  const [tab, setTab] = useState<CompareTab>("shared");

  const myFormat = parseScoreFormat(selfUser?.score_format);
  const friendFormat = parseScoreFormat(friendProfile?.score_format);
  const summary = useMemo(
    () => buildCompareSummary(selfLists, friendLists, myFormat, friendFormat),
    [selfLists, friendLists, myFormat, friendFormat]
  );
  const genres = useMemo(() => topGenreOverlap(selfLists, friendLists), [selfLists, friendLists]);
  const commonFavs = useMemo(
    () => sharedFavourites(selfFavourites, friendFavourites),
    [selfFavourites, friendFavourites]
  );
  const rows =
    tab === "shared" ? summary.shared : tab === "mine" ? summary.onlyMine : summary.onlyFriend;

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
      <VersusHeader selfUser={selfUser} friendProfile={friendProfile} />
      <MetricSection summary={summary} metric={metric} onMetric={setMetric} />
      <CompareTabBar tab={tab} onTab={setTab} />
      <TitleRows rows={rows} tab={tab} myFormat={myFormat} friendFormat={friendFormat} />
      <GenreSection genres={genres} />
      <FavsSection favourites={commonFavs} />
    </div>
  );
}
