import Pagination from "@/components/shared/pagination.component";
import { useI18n } from "@/hooks/i18n.hook";

export default function SearchPager({
  page,
  pageFull,
  isLoading,
  shown,
  resultsPerPage,
  onPageChange,
}: {
  page: number;
  pageFull: boolean;
  isLoading: boolean;
  shown: number;
  resultsPerPage: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useI18n();
  // Site-paged sources expose no total: the furthest known page stands in
  // for lastPage (a jump past the end returns empty and steps back, as before).
  const lastPage = pageFull ? page + 1 : page;
  const from = (page - 1) * resultsPerPage + 1;
  const to = from + Math.max(shown, 1) - 1;
  return (
    <Pagination
      total={0}
      page={page}
      lastPage={lastPage}
      from={from}
      to={to}
      statusText={t("search.page", { page })}
      onPageChange={(next) => {
        if (!isLoading) onPageChange(next);
      }}
    />
  );
}
