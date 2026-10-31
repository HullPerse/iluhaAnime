import Pagination from "@/components/shared/pagination.component";
import { SEARCH_MODE_LABELS } from "@/config/anilist/searchModes.config";
import { listStatusLabels } from "@/config/system/labels.config";
import { useI18n } from "@/hooks/i18n.hook";
import { ALL_LISTS_ID } from "@/lib/anilist/anilistGroup.utils";
import { toLocaleKey } from "@/lib/locale/key.utils";
import type { SearchMode } from "@/types/anilist/anilist";

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
  const listLabel =
    currentList === ALL_LISTS_ID
      ? t("anilist.lists.all")
      : t(toLocaleKey(listStatusLabels[currentList.toUpperCase()] ?? currentList));
  const modeKey = searchMode ? SEARCH_MODE_LABELS[searchMode] : undefined;
  const tagSuffix = searchTag && modeKey ? ` - ${t(modeKey)}: ${searchTag}` : "";
  const statusRows: { when: boolean; text: string }[] = [
    {
      when: global,
      text: `${t("anilist.route.search.results", { count: searchResultsCount })}${tagSuffix}`,
    },
    { when: isLocal, text: `${listLabel}: ${filteredCount} / ${activeCount}` },
    { when: hasUser, text: `${listLabel}: ${activeCount}` },
  ];
  const statusText = statusRows.find((row) => row.when)?.text;
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
