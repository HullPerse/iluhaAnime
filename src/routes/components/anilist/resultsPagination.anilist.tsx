import Pagination from "@/components/shared/pagination.component";
import { listStatusLabels } from "@/config/anilist/labels.config";
import { useI18n } from "@/lib/locale/i18n.utils";
import { toLocaleKey } from "@/lib/locale/key.utils";
import type { SearchMode } from "@/types/anilist";

export default function AniListResultsPagination({
  global,
  isLocal,
  hasUser,
  searchResultsCount,
  searchTag,
  searchMode,
  currentList,
  filteredCount,
  activeCount,
  total,
  page,
  lastPage,
  from,
  to,
  onPageChange,
  scrollRef,
}: {
  global: boolean;
  isLocal: boolean;
  hasUser: boolean;
  searchResultsCount: number;
  searchTag: string | null;
  searchMode: SearchMode;
  currentList: string;
  filteredCount: number;
  activeCount: number;
  total: number;
  page: number;
  lastPage: number;
  from: number;
  to: number;
  onPageChange: (page: number) => void;
  scrollRef: React.RefObject<HTMLElement | null>;
}) {
  const { t } = useI18n();
  const listLabel = t(toLocaleKey(listStatusLabels[currentList.toUpperCase()] ?? currentList));
  const statusText = global
    ? `${t("anilist.route.search.results", { count: searchResultsCount })}${searchTag ? ` · ${searchMode === "studio" ? t("anilist.route.studio") : searchMode === "season" ? t("anilist.route.season") : t("anilist.route.tag")}: ${searchTag}` : ""}`
    : isLocal
      ? `${listLabel}: ${filteredCount} / ${activeCount}`
      : hasUser
        ? `${listLabel}: ${activeCount}`
        : undefined;
  return (
    <Pagination
      total={total}
      page={page}
      lastPage={lastPage}
      from={from}
      to={to}
      onPageChange={onPageChange}
      scrollRef={scrollRef}
      statusText={statusText}
    />
  );
}
