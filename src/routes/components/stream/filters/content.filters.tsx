import { useState } from "react";

import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { DualSlider } from "@/components/ui/dualSlider.component";
import {
  DEFAULT_STREAM_FILTERS,
  STREAM_EPISODES_MAX,
  STREAM_YEAR_MIN,
  isAdultAgeRating,
  streamYearMax,
  withoutAdultFilters,
} from "@/config/player/streamFilters.config";
import { useI18n } from "@/hooks/i18n.hook";
import { useStreamConstants } from "@/hooks/stream/catalog.hook";
import type { StreamCatalogFilters } from "@/types/player/stream";

import { GenrePicker } from "@/routes/components/stream/filters/genre.filters";
import { OptionChips } from "@/routes/components/stream/filters/options.filters";
import { ToggleChip } from "@/routes/components/stream/filters/chip.filters";

export function FiltersContent({
  initial,
  onApply,
  onClose,
}: {
  initial: StreamCatalogFilters;
  onApply: (filters: StreamCatalogFilters) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [local, setLocal] = useState<StreamCatalogFilters>(initial);
  const constants = useStreamConstants(true);
  const data = constants.data;
  const yearMax = streamYearMax();
  const toggleId = (key: "types" | "statuses" | "ageRatings", id: number) => {
    const selected = local[key];
    setLocal({
      ...local,
      [key]: selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id],
    });
  };
  const patch = (next: Partial<StreamCatalogFilters>) => setLocal({ ...local, ...next });
  const filtersLoading = constants.isPending;
  const filtersFailed = !filtersLoading && constants.error !== null;

  return (
    <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto p-2">
      {filtersLoading && (
        <p className="text-hint windows95-text text-xs">{t("stream.filters.loading")}</p>
      )}
      {filtersFailed && constants.error && (
        <div className="flex items-center gap-2">
          <p className="text-destructive windows95-text min-w-0 flex-1 text-xs">
            {constants.error.message}
          </p>
          <Button className="h-6 px-2 text-xs" onClick={() => constants.refetch()}>
            {t("stream.retry")}
          </Button>
        </div>
      )}

      {data && (
        <>
          <p className="windows95-text text-text text-xs font-bold">{t("stream.filters.types")}</p>
          <OptionChips
            options={data.types}
            selected={local.types}
            onToggle={(id) => toggleId("types", id)}
          />

          <p className="windows95-text text-text mt-1 text-xs font-bold">
            {t("stream.filters.statuses")}
          </p>
          <OptionChips
            options={data.statuses}
            selected={local.statuses}
            onToggle={(id) => toggleId("statuses", id)}
          />

          <p className="windows95-text text-text mt-1 text-xs font-bold">
            {t("stream.filters.genres")}
          </p>
          <GenrePicker constants={data} filters={local} onChange={setLocal} />
        </>
      )}

      <p className="windows95-text text-text mt-1 text-xs font-bold">{t("stream.filters.age")}</p>
      {data && (
        <div className="flex flex-wrap gap-1">
          {data.ageRatings
            .filter((option) => local.adult || !isAdultAgeRating(option.id))
            .map((option) => (
              <ToggleChip
                key={option.id}
                active={local.ageRatings.includes(option.id)}
                danger={isAdultAgeRating(option.id)}
                label={option.label}
                onToggle={() => toggleId("ageRatings", option.id)}
              />
            ))}
        </div>
      )}

      <p className="windows95-text text-text mt-1 text-xs font-bold">{t("stream.filters.year")}</p>
      <DualSlider
        wheel
        min={STREAM_YEAR_MIN}
        max={yearMax}
        step={1}
        value={[local.yearMin ?? STREAM_YEAR_MIN, local.yearMax ?? yearMax]}
        onChange={([from, to]) =>
          patch({
            yearMin: from === STREAM_YEAR_MIN ? null : from,
            yearMax: to === yearMax ? null : to,
          })
        }
      />

      <p className="windows95-text text-text mt-1 text-xs font-bold">
        {t("stream.filters.episodes")}
      </p>
      <DualSlider
        wheel
        min={0}
        max={STREAM_EPISODES_MAX}
        step={1}
        value={[local.episodesMin ?? 0, local.episodesMax ?? STREAM_EPISODES_MAX]}
        onChange={([from, to]) =>
          patch({
            episodesMin: from > 0 ? from : null,
            episodesMax: to < STREAM_EPISODES_MAX ? to : null,
          })
        }
      />

      <label className="windows95-text mt-1 flex cursor-pointer items-center gap-2 text-xs select-none">
        <Checkbox
          checked={local.adult}
          onChange={(checked) =>
            setLocal(
              checked ? { ...local, adult: true } : withoutAdultFilters(local, data?.genres ?? [])
            )
          }
        />
        <span className="text-destructive font-bold">{t("stream.filters.nsfw")}</span>
      </label>

      <div className="mt-3 flex justify-end gap-1">
        <Button
          variant="outline"
          className="mr-auto"
          onClick={() => {
            onApply(DEFAULT_STREAM_FILTERS);
            onClose();
          }}
        >
          {t("stream.filters.reset")}
        </Button>
        <Button
          onClick={() => {
            onApply(local);
            onClose();
          }}
        >
          {t("stream.filters.apply")}
        </Button>
      </div>
    </div>
  );
}
