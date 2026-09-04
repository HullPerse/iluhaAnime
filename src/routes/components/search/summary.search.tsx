import { useI18n } from "@/lib/i18n";
import type { Anime } from "@/types";

export default function SearchResultsSummary({
  data,
  shown,
  isPagedSource,
  page,
  resultsPerPage,
}: {
  data: Anime[];
  shown: number;
  isPagedSource: boolean;
  page: number;
  resultsPerPage: number;
}) {
  const { t } = useI18n();
  return (
    <span className="windows95-text px-1 text-xs">
      {isPagedSource
        ? t("search.page.results", {
            page,
            shown,
            total: data.length,
            status: data.length < resultsPerPage ? t("search.all.shown") : t("search.more.available"),
          })
        : t("search.results.count", { count: data.length })}
    </span>
  );
}
