import { useMemo, useState } from "react";

import { SmallLoader } from "@/components/shared/loader/small.loader";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import {
  buildCompareSummary,
  filterCompareRows,
  sortCompareRows,
  topGenreTaste,
  sharedFavourites,
} from "@/lib/core/compare.utils";
import type { CompareMetric, CompareSort } from "@/types/core/compare";
import { parseScoreFormat } from "@/lib/anilist/anilistScore.utils";
import type {
  AniListCollection,
  AniUser,
  AniUserProfile,
  FavouriteAnime,
} from "@/types/anilist/anilist";

import { SORT_KEYS, SORTS_BY_TAB } from "@/routes/components/anilist/compare/constants.compare";
import type { CompareTab } from "@/routes/components/anilist/compare/constants.compare";

import { CompareHero } from "@/routes/components/anilist/compare/hero.compare";
import { CompareTabs } from "@/routes/components/anilist/compare/tabs.compare";
import { CompareToolbar } from "@/routes/components/anilist/compare/toolbar.compare";
import { TitleRows } from "@/routes/components/anilist/compare/titleRows.compare";
import { GenreSection } from "@/routes/components/anilist/compare/genreSection.compare";
import { FavsSection } from "@/routes/components/anilist/compare/favsSection.compare";

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
  const [query, setQuery] = useState<string>("");
  const [diffMode, setDiffMode] = useState<boolean>(false);

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
  const rowsByTab = {
    shared: summary.shared,
    mine: summary.onlyMine,
    friend: summary.onlyFriend,
  };
  const rows = rowsByTab[tab];
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
