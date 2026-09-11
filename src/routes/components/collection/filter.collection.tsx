import { Star } from "lucide-react";
import { useState } from "react";

import ChipsRow from "@/components/shared/chips.component";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import Combobox from "@/components/ui/combobox.component";
import { DualSlider } from "@/components/ui/dualSlider.component";
import { Radio, RadioGroup } from "@/components/ui/radio.component";
import { ANILIST_GENRES } from "@/config/anilist/filters.config";
import { RATING_MAX, RATING_MIN, YEAR_MAX, YEAR_MIN } from "@/config/collection/filters.config";
import { freshDefaults } from "@/lib/collection/filter.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { CollectionFilters, CollectionType } from "@/types/collection";

export default function FilterCollection({
  open,
  filters,
  onApply,
  onClose,
}: {
  open: boolean;
  filters: CollectionFilters;
  onApply: (filters: CollectionFilters) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [local, setLocal] = useState<CollectionFilters>(filters);
  const [genreSelect, setGenreSelect] = useState("");

  if (!open) return null;

  const addGenre = (value: string) => {
    if (!value || local.genres.includes(value)) return;
    setLocal((data) => ({ ...data, genres: [...data.genres, value] }));
    setGenreSelect("");
  };

  const toggleMediaType = (value: CollectionType) => {
    setLocal((data) => ({
      ...data,
      mediaTypes: data.mediaTypes.includes(value)
        ? data.mediaTypes.filter((type) => type !== value)
        : [...data.mediaTypes, value],
    }));
  };

  const handleReset = () => {
    setLocal(freshDefaults());
  };
  const providerOptions = [
    { value: "any", label: t("collection.filters.any") },
    { value: "anilist", label: "AniList" },
    { value: "tmdb", label: "TMDB" },
    { value: "custom", label: t("collection.type.custom") },
  ] as const;

  const yesNoOptions = [
    { value: "yes", label: t("collection.filters.yes") },
    { value: "no", label: t("collection.filters.no") },
    { value: "any", label: t("collection.filters.any") },
  ] as const;

  const mediaTypeOptions = [
    { value: "anime", label: t("collection.type.anime") },
    { value: "movie", label: t("collection.type.movie") },
    { value: "series", label: t("collection.type.series") },
    { value: "custom", label: t("collection.type.custom") },
  ] as const;

  const genreOpts = ANILIST_GENRES.filter((g) => !local.genres.includes(g)).map((g) => ({
    value: g,
    label: g,
  }));

  return (
    <Modal header={t("collection.filters.title")} onClose={onClose} className="w-xl">
      <div className="flex flex-col gap-3 overflow-y-auto p-2">
        <p className="windows95-text text-text font-bold">{t("collection.filters.rating")}</p>
        <DualSlider
          wheel
          min={RATING_MIN}
          max={RATING_MAX}
          step={1}
          suffix={<Star className="size-3" fill="currentColor" aria-hidden />}
          value={[local.ratingMin ?? RATING_MIN, local.ratingMax ?? RATING_MAX]}
          onChange={(v) => setLocal((p) => ({ ...p, ratingMin: v[0], ratingMax: v[1] }))}
        />

        <p className="windows95-text text-text mt-1 font-bold">{t("collection.filters.year")}</p>
        <DualSlider
          wheel
          min={YEAR_MIN}
          max={YEAR_MAX}
          step={1}
          value={[local.yearFrom ?? YEAR_MIN, local.yearTo ?? YEAR_MAX]}
          onChange={(v) => setLocal((p) => ({ ...p, yearFrom: v[0], yearTo: v[1] }))}
        />
        <p className="windows95-text text-text mt-1 font-bold">
          {t("collection.filters.provider")}
        </p>
        <RadioGroup
          value={local.provider}
          onChange={(v) => setLocal((p) => ({ ...p, provider: v }))}
          className="flex flex-wrap gap-1"
        >
          {providerOptions.map((option) => {
            const select = () => setLocal((p) => ({ ...p, provider: option.value }));
            return (
              <label
                key={option.value}
                className="windows95-text flex cursor-pointer items-center gap-1 select-none"
                onClick={select}
              >
                <Radio value={option.value} />
                {option.label}
              </label>
            );
          })}
        </RadioGroup>

        <p className="windows95-text text-text mt-1 font-bold">{t("collection.filters.linked")}</p>
        <RadioGroup
          value={local.linked}
          onChange={(v) => setLocal((p) => ({ ...p, linked: v }))}
          className="flex flex-wrap gap-1"
        >
          {yesNoOptions.map((option) => {
            const select = () => setLocal((p) => ({ ...p, linked: option.value }));
            return (
              <label
                key={option.value}
                className="windows95-text flex cursor-pointer items-center gap-1 select-none"
                onClick={select}
              >
                <Radio value={option.value} />
                {option.label}
              </label>
            );
          })}
        </RadioGroup>

        <p className="windows95-text text-text mt-1 font-bold">
          {t("collection.filters.has.note")}
        </p>
        <RadioGroup
          value={local.hasNote}
          onChange={(v) => setLocal((p) => ({ ...p, hasNote: v }))}
          className="flex flex-wrap gap-1"
        >
          {yesNoOptions.map((option) => {
            const select = () => setLocal((p) => ({ ...p, hasNote: option.value }));
            return (
              <label
                key={option.value}
                className="windows95-text flex cursor-pointer items-center gap-1 select-none"
                onClick={select}
              >
                <Radio value={option.value} />
                {option.label}
              </label>
            );
          })}
        </RadioGroup>

        <p className="windows95-text text-text mt-1 font-bold">
          {t("collection.filters.media.types")}
        </p>
        <div className="flex flex-wrap gap-1">
          {mediaTypeOptions.map((option) => (
            <label
              key={option.value}
              className="windows95-text flex cursor-pointer items-center gap-1 select-none"
            >
              <Checkbox
                checked={local.mediaTypes.includes(option.value)}
                onChange={() => toggleMediaType(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>

        <p className="windows95-text text-text mt-1 font-bold">{t("collection.filters.genres")}</p>
        <Combobox
          className="w-full"
          value={genreSelect}
          onChange={addGenre}
          placeholder={t("collection.filters.genres.placeholder")}
          options={genreOpts}
          indexed
        />
        <ChipsRow
          items={local.genres}
          onRemove={(value) =>
            setLocal((data) => ({
              ...data,
              genres: data.genres.filter((genre) => genre !== value),
            }))
          }
        />

        <div className="mt-3 flex justify-end gap-1">
          <Button variant="outline" onClick={handleReset}>
            {t("collection.filters.reset")}
          </Button>
          <Button variant="default" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => {
              onApply(local);
              onClose();
            }}
          >
            {t("collection.filters.apply")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
