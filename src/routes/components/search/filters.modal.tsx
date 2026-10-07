import { SortAsc, SortDesc, X } from "lucide-react";
import { useState } from "react";

import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import Combobox from "@/components/ui/combobox.component";
import { Input } from "@/components/ui/input.component";
import Select from "@/components/ui/select.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useCell } from "@/lib/state/signal.hook";
import {
  deleteSearchFilterPreset,
  saveSearchFilterPreset,
  searchAtoms,
} from "@/store/search.store";
import type { SearchFilters, SortKey } from "@/types/search";
import type { ModalFiltersProps as Props } from "@/types/search";

const FILTER_PRESETS: Array<{ name: string; filters: Partial<SearchFilters> }> = [
  { name: "1080p+", filters: { quality: "1080p", minSeeders: 10 } },
  { name: "4K", filters: { quality: "2160p", minSeeders: 1 } },
  { name: "HEVC", filters: { codec: "HEVC", quality: "1080p" } },
  { name: "Light", filters: { quality: "720p", sizeMax: 2500 } },
];

export default function SearchFiltersModal({
  open,
  filters,
  onApply,
  onReset,
  onClose,
  sort,
  direction,
  onSortChange,
  onDirectionChange,
}: Props) {
  const { t } = useI18n();
  const [local, setLocal] = useState<SearchFilters>(filters);
  const [presetName, setPresetName] = useState("");
  const userPresets = useCell(searchAtoms.filterPresets);

  if (!open) return null;

  const patch = (partial: Partial<SearchFilters>) => setLocal((p) => ({ ...p, ...partial }));

  const handleReset = () => {
    onReset();
    onClose();
  };

  return (
    <Modal
      header={t("search.filters.title")}
      onClose={onClose}
      headerActions={
        sort &&
        direction &&
        onDirectionChange && (
          <button
            type="button"
            onClick={onDirectionChange}
            title={direction === "desc" ? t("search.sort.desc") : t("search.sort.asc")}
            aria-label={direction === "desc" ? t("search.sort.desc") : t("search.sort.asc")}
            className="windows95-active-border bg-primary text-text windows95-text flex size-5 cursor-pointer items-center justify-center hover:brightness-110 active:translate-x-px active:translate-y-px"
          >
            {direction === "desc" ? (
              <SortDesc className="size-2.5" />
            ) : (
              <SortAsc className="size-2.5" />
            )}
          </button>
        )
      }
      className="w-xl"
    >
      <div className="flex flex-col gap-3 overflow-y-auto p-2">
        {sort && direction && onSortChange && onDirectionChange && (
          <>
            <div className="flex items-center gap-1">
              <span className="windows95-text text-text">{t("search.sort.by")}</span>
              <Select
                className="w-22"
                value={sort}
                onChange={(v) => onSortChange(v as SortKey)}
                options={[
                  { value: "seeders", label: t("search.sort.seeders") },
                  { value: "leechers", label: t("search.sort.leechers") },
                  { value: "size", label: t("search.sort.size") },
                  { value: "date", label: t("search.sort.date") },
                ]}
              />
            </div>
            <hr className="border-muted my-1 w-full border-t" />
          </>
        )}
        <p className="windows95-text text-text font-bold">{t("search.filters.presets")}</p>
        <div className="flex flex-wrap gap-1">
          {FILTER_PRESETS.map((preset) => (
            <Button
              key={preset.name}
              variant="outline"
              className="h-6 text-xs"
              onClick={() => setLocal((p) => ({ ...p, ...preset.filters }))}
            >
              {preset.name}
            </Button>
          ))}
        </div>
        {userPresets.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {userPresets.map((preset) => (
              <span key={preset.name} className="flex items-center">
                <Button
                  variant="secondary"
                  className="h-6 rounded-r-none text-xs"
                  title={preset.name}
                  onClick={() => setLocal({ ...preset.filters })}
                >
                  <span className="max-w-32 truncate">{preset.name}</span>
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-6 w-5 rounded-l-none"
                  title={t("search.filters.preset.delete")}
                  aria-label={`${t("search.filters.preset.delete")}: ${preset.name}`}
                  onClick={() => deleteSearchFilterPreset(preset.name)}
                >
                  <X className="size-3" />
                </Button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1">
          <Input
            placeholder={t("search.filters.preset.name")}
            aria-label={t("search.filters.preset.name")}
            className="h-6 max-w-48 text-xs"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && presetName.trim()) {
                saveSearchFilterPreset(presetName, local);
                setPresetName("");
              }
            }}
          />
          <Button
            variant="outline"
            className="h-6 text-xs"
            disabled={!presetName.trim()}
            onClick={() => {
              saveSearchFilterPreset(presetName, local);
              setPresetName("");
            }}
          >
            {t("search.filters.preset.save")}
          </Button>
        </div>

        <hr className="border-muted my-1 w-full border-t" />

        <p className="windows95-text text-text font-bold">{t("search.filters.min.seeders")}</p>
        <Input
          type="number"
          min={0}
          placeholder={t("search.filters.any.zero")}
          className="w-24"
          value={local.minSeeders || ""}
          onChange={(e) => patch({ minSeeders: Math.max(0, Number(e.target.value) || 0) })}
        />

        <hr className="border-muted my-1 w-full border-t" />

        <label className="windows95-text flex cursor-pointer items-center gap-2 select-none">
          <Checkbox checked={local.hasMagnet} onChange={(v) => patch({ hasMagnet: v })} />
          {t("search.filters.only.magnet")}
        </label>

        <hr className="border-muted my-1 w-full border-t" />

        <p className="windows95-text text-text font-bold">{t("search.filters.quality")}</p>
        <Combobox
          className="w-full"
          value={local.quality}
          onChange={(v) => patch({ quality: v })}
          options={[
            { value: "all", label: t("search.filters.any") },
            { value: "2160p", label: "2160p" },
            { value: "1080p", label: "1080p" },
            { value: "720p", label: "720p" },
            { value: "480p", label: "480p" },
          ]}
        />

        <p className="windows95-text text-text font-bold">{t("search.filters.language")}</p>
        <Combobox
          className="w-full"
          value={local.language}
          onChange={(v) => patch({ language: v })}
          options={[
            { value: "all", label: t("search.filters.any") },
            { value: "ru", label: t("search.filters.russian") },
            { value: "en", label: t("search.filters.english") },
            { value: "multi", label: "MultiSub" },
            { value: "dual", label: "Dual Audio" },
          ]}
        />

        <p className="windows95-text text-text font-bold">{t("search.filters.codec")}</p>
        <Combobox
          className="w-full"
          value={local.codec}
          onChange={(v) => patch({ codec: v })}
          options={[
            { value: "all", label: t("search.filters.any") },
            { value: "HEVC", label: "HEVC / x265" },
            { value: "x264", label: "x264" },
            { value: "AV1", label: "AV1" },
          ]}
        />

        <hr className="border-muted my-1 w-full border-t" />

        <p className="windows95-text text-text font-bold">{t("search.filters.size")}</p>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            placeholder={t("search.filters.from")}
            className="w-24"
            value={local.sizeMin || ""}
            onChange={(e) => patch({ sizeMin: Math.max(0, Number(e.target.value) || 0) })}
          />
          <span className="windows95-text">-</span>
          <Input
            type="number"
            min={0}
            placeholder={t("search.filters.to")}
            className="w-24"
            value={local.sizeMax || ""}
            onChange={(e) => patch({ sizeMax: Math.max(0, Number(e.target.value) || 0) })}
          />
        </div>

        <div className="mt-3 flex justify-end gap-1">
          <Button variant="outline" onClick={handleReset}>
            {t("search.filters.reset")}
          </Button>
          <Button
            onClick={() => {
              onApply(local);
              onClose();
            }}
          >
            {t("search.filters.apply")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
