import { X } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/i18n";
import type { CollectionFilters } from "@/types/collection";

export function CollectionFiltersPanel({
  filters,
  setFilters,
}: {
  filters: CollectionFilters;
  setFilters: (patch: Partial<CollectionFilters>) => void;
}) {
  const { t } = useI18n();
  return (
    <section className="ui-toolbar ui-panel flex flex-wrap items-center gap-1">
      <span className="text-xs font-bold">{t("collection.filters.title")}</span>
      <label className="flex items-center gap-1 text-xs">
        {t("collection.filters.ratingMin")}
        <input
          type="number"
          min="0"
          max="10"
          value={filters.ratingMin ?? ""}
          onChange={(e) =>
            setFilters({
              ratingMin: e.target.value ? Number(e.target.value) : null,
            })
          }
          className="windows95-border w-12 bg-white px-1 py-0.5"
        />
      </label>
      <label className="flex items-center gap-1 text-xs">
        {t("collection.filters.yearFrom")}
        <input
          type="number"
          value={filters.yearFrom ?? ""}
          onChange={(e) =>
            setFilters({
              yearFrom: e.target.value ? Number(e.target.value) : null,
            })
          }
          className="windows95-border w-14 bg-white px-1 py-0.5"
        />
      </label>
      <label className="flex items-center gap-1 text-xs">
        {t("collection.filters.yearTo")}
        <input
          type="number"
          value={filters.yearTo ?? ""}
          onChange={(e) =>
            setFilters({
              yearTo: e.target.value ? Number(e.target.value) : null,
            })
          }
          className="windows95-border w-14 bg-white px-1 py-0.5"
        />
      </label>
      <label className="flex items-center gap-1 text-xs">
        {t("collection.filters.provider")}
        <select
          value={filters.provider}
          onChange={(e) =>
            setFilters({ provider: e.target.value as typeof filters.provider })
          }
          className="windows95-border bg-white px-1 py-0.5"
        >
          <option value="any">{t("collection.filters.any")}</option>
          <option value="anilist">AniList</option>
          <option value="tmdb">TMDB</option>
          <option value="custom">{t("collection.type.custom")}</option>
        </select>
      </label>
      <label className="flex items-center gap-1 text-xs">
        {t("collection.filters.linked")}
        <select
          value={filters.linked}
          onChange={(e) =>
            setFilters({ linked: e.target.value as typeof filters.linked })
          }
          className="windows95-border bg-white px-1 py-0.5"
        >
          <option value="any">{t("collection.filters.any")}</option>
          <option value="yes">{t("collection.filters.yes")}</option>
          <option value="no">{t("collection.filters.no")}</option>
        </select>
      </label>
      <label className="flex items-center gap-1 text-xs">
        {t("collection.filters.hasNote")}
        <select
          value={filters.hasNote}
          onChange={(e) =>
            setFilters({ hasNote: e.target.value as typeof filters.hasNote })
          }
          className="windows95-border bg-white px-1 py-0.5"
        >
          <option value="any">{t("collection.filters.any")}</option>
          <option value="yes">{t("collection.filters.yes")}</option>
          <option value="no">{t("collection.filters.no")}</option>
        </select>
      </label>
      <Button
        size="icon"
        variant="destructive"
        className="ml-auto size-5"
        onClick={() =>
          setFilters({
            ratingMin: null,
            yearFrom: null,
            yearTo: null,
            provider: "any",
            linked: "any",
            hasNote: "any",
          })
        }
        aria-label={t("collection.filters.reset")}
      >
        <X className="size-3" />
      </Button>
    </section>
  );
}

