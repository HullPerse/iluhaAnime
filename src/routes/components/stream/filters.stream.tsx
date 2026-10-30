import { X } from "lucide-react";
import { useState } from "react";

import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import Combobox from "@/components/ui/combobox.component";
import { DualSlider } from "@/components/ui/dualSlider.component";
import {
  DEFAULT_STREAM_FILTERS,
  STREAM_EPISODES_MAX,
  STREAM_YEAR_MIN,
  isAdultAgeRating,
  streamYearMax,
  withoutAdultFilters,
} from "@/config/streamFilters.config";
import { useI18n } from "@/hooks/i18n.hook";
import { useStreamConstants } from "@/hooks/stream/catalog.hook";
import type { StreamCatalogFilters, StreamConstants, StreamFilterOption } from "@/types/stream";

function ToggleChip({
  active,
  label,
  danger = false,
  onToggle,
}: {
  active: boolean;
  label: string;
  danger?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={`windows95-text windows95-border cursor-pointer px-1 py-0.5 text-xs ${
        active ? "bg-secondary text-title-text" : "bg-field text-text hover:bg-surface"
      } ${danger && !active ? "text-destructive" : ""}`}
    >
      {label}
    </button>
  );
}

function OptionChips({
  options,
  selected,
  onToggle,
}: {
  options: StreamFilterOption[];
  selected: number[];
  onToggle: (id: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((option) => (
        <ToggleChip
          key={option.id}
          active={selected.includes(option.id)}
          label={option.label}
          onToggle={() => onToggle(option.id)}
        />
      ))}
    </div>
  );
}

function GenrePicker({
  constants,
  filters,
  onChange,
}: {
  constants: StreamConstants;
  filters: StreamCatalogFilters;
  onChange: (filters: StreamCatalogFilters) => void;
}) {
  const { t } = useI18n();
  const [pick, setPick] = useState("");
  const visible = constants.genres.filter((genre) => filters.adult || !genre.adult);
  const selected = filters.genres
    .map((id) => visible.find((genre) => genre.id === id))
    .filter((genre): genre is NonNullable<typeof genre> => genre !== undefined);
  const options = visible
    .filter((genre) => !filters.genres.includes(genre.id))
    .map((genre) => ({
      value: String(genre.id),
      label: genre.adult ? `${genre.label} (18+)` : genre.label,
    }));

  return (
    <>
      <Combobox
        className="w-full"
        value={pick}
        onChange={(value) => {
          if (!value) return;
          const id = Number(value);
          if (!filters.genres.includes(id)) {
            onChange({ ...filters, genres: [...filters.genres, id] });
          }
          setPick("");
        }}
        placeholder={t("stream.filters.genre.placeholder")}
        options={options}
        indexed
      />
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {selected.map((genre) => (
            <button
              key={genre.id}
              type="button"
              className="windows95-border text-text windows95-text bg-field hover:bg-surface inline-flex cursor-pointer items-center gap-0.5 px-1 text-xs"
              title={t("common.delete")}
              onClick={() =>
                onChange({
                  ...filters,
                  genres: filters.genres.filter((id) => id !== genre.id),
                })
              }
            >
              {genre.label}
              <X className="size-3" aria-hidden />
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

function FiltersContent({
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

  return (
    <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto p-2">
      {constants.isPending ? (
        <p className="text-hint windows95-text text-xs">{t("stream.filters.loading")}</p>
      ) : constants.error ? (
        <div className="flex items-center gap-2">
          <p className="text-destructive windows95-text min-w-0 flex-1 text-xs">
            {constants.error.message}
          </p>
          <Button className="h-6 px-2 text-xs" onClick={() => constants.refetch()}>
            {t("stream.retry")}
          </Button>
        </div>
      ) : null}

      {data ? (
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
      ) : null}

      <p className="windows95-text text-text mt-1 text-xs font-bold">{t("stream.filters.age")}</p>
      {data ? (
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
      ) : null}

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

      {/* Sorting is not a filter: it lives on the always-visible sort bar, so
          this modal never hides the order the results are in. */}
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

export default function StreamFiltersModal({
  open,
  filters,
  onApply,
  onClose,
}: {
  open: boolean;
  filters: StreamCatalogFilters;
  onApply: (filters: StreamCatalogFilters) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  if (!open) return null;
  return (
    <Modal header={t("stream.filters.title")} onClose={onClose} className="w-xl">
      <FiltersContent initial={filters} onApply={onApply} onClose={onClose} />
    </Modal>
  );
}
