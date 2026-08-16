import { useState } from "react";

import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { Input } from "@/components/ui/input.component";
import Select from "@/components/ui/select.component";
import { useI18n } from "@/lib/i18n";
import type { SearchFilters } from "@/types/search";

interface Props {
  open: boolean;
  filters: SearchFilters;
  onApply: (filters: SearchFilters) => void;
  onReset: () => void;
  onClose: () => void;
}

export default function SearchFiltersModal({
  open,
  filters,
  onApply,
  onReset,
  onClose,
}: Props) {
  const { t } = useI18n();
  const [local, setLocal] = useState<SearchFilters>(filters);

  if (!open) return null;

  const patch = (partial: Partial<SearchFilters>) =>
    setLocal((p) => ({ ...p, ...partial }));

  const handleReset = () => {
    onReset();
    onClose();
  };

  return (
    <Modal
      header={t("search.filters.title")}
      onClose={onClose}
      className="w-xl"
    >
      <div className="flex flex-col gap-3 overflow-y-auto p-2">
        <p className="windows95-text text-text font-bold">
          {t("search.filters.minSeeders")}
        </p>
        <Input
          type="number"
          min={0}
          placeholder={t("search.filters.anyZero")}
          className="w-24"
          value={local.minSeeders || ""}
          onChange={(e) =>
            patch({ minSeeders: Math.max(0, Number(e.target.value) || 0) })
          }
        />

        <hr className="windows95-header w-full" />

        <label className="windows95-text flex cursor-pointer items-center gap-2 select-none">
          <Checkbox
            checked={local.hasMagnet}
            onChange={(v) => patch({ hasMagnet: v })}
          />
          {t("search.filters.onlyMagnet")}
        </label>

        <hr className="windows95-header w-full" />

        <p className="windows95-text text-text font-bold">
          {t("search.filters.quality")}
        </p>
        <Select
          className="w-full"
          value={local.quality}
          onChange={(v) => patch({ quality: v })}
          options={[
            { value: "all", label: t("search.filters.any") },
            { value: "1080p", label: "1080p" },
            { value: "720p", label: "720p" },
            { value: "480p", label: "480p" },
          ]}
        />

        <p className="windows95-text text-text font-bold">
          {t("search.filters.language")}
        </p>
        <Select
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

        <p className="windows95-text text-text font-bold">
          {t("search.filters.codec")}
        </p>
        <Select
          className="w-full"
          value={local.codec}
          onChange={(v) => patch({ codec: v })}
          options={[
            { value: "all", label: t("search.filters.any") },
            { value: "HEVC", label: "HEVC / x265" },
            { value: "x264", label: "x264" },
          ]}
        />

        <hr className="windows95-header w-full" />

        <p className="windows95-text text-text font-bold">
          {t("search.filters.size")}
        </p>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            placeholder={t("search.filters.from")}
            className="w-24"
            value={local.sizeMin || ""}
            onChange={(e) =>
              patch({ sizeMin: Math.max(0, Number(e.target.value) || 0) })
            }
          />
          <span className="windows95-text">—</span>
          <Input
            type="number"
            min={0}
            placeholder={t("search.filters.to")}
            className="w-24"
            value={local.sizeMax || ""}
            onChange={(e) =>
              patch({ sizeMax: Math.max(0, Number(e.target.value) || 0) })
            }
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
