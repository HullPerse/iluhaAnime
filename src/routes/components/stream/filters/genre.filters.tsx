import { X } from "lucide-react";
import { useState } from "react";

import Combobox from "@/components/ui/combobox.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { StreamCatalogFilters, StreamConstants } from "@/types/player/stream";

export function GenrePicker({
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
      {selected.length > 0 && (
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
      )}
    </>
  );
}
