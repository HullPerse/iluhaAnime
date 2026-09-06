import { SortAsc, SortDesc } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n, type TranslationKey } from "@/lib/locale/i18n.utils";
import type { GlobalSort } from "@/types/anilist";

export default function AniListGlobalSortBar({
  sort,
  onSortChange,
}: {
  sort: GlobalSort;
  onSortChange: React.Dispatch<React.SetStateAction<GlobalSort>>;
}) {
  const { t } = useI18n();
  const labels: Record<GlobalSort["key"], TranslationKey> = {
    relevance: "anilist.route.sort.relevance",
    title: "anilist.route.sort.title",
    score: "anilist.route.sort.score",
    year: "anilist.route.sort.year",
  };
  return (
    <section className="windows95-border bg-primary flex flex-row items-center gap-2 px-1 py-0.5">
      <span className="windows95-text text-hint text-xs">{t("anilist.route.sorting")}</span>
      {(["relevance", "title", "score", "year"] as const).map((s) => {
        const isActive = sort.key === s;
        const isRelevance = s === "relevance";
        return (
          <Button
            key={s}
            variant={isActive ? "outline" : "default"}
            size="default"
            className="px-2 py-0.5"
            onClick={() => {
              if (isRelevance) onSortChange({ key: "relevance", dir: "desc" });
              else
                onSortChange((prev) => ({
                  key: s,
                  dir: isActive ? (prev.dir === "asc" ? "desc" : "asc") : prev.dir,
                }));
            }}
          >
            {t(labels[s])}
            {isActive &&
              (sort.dir === "asc" ? (
                <SortAsc className="size-3" />
              ) : (
                <SortDesc className="size-3" />
              ))}
          </Button>
        );
      })}
    </section>
  );
}
