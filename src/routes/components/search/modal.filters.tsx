import type { SearchFilters } from "@/types/search";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import Select from "@/components/ui/select.component";
import { useState } from "react";

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
  const [local, setLocal] = useState<SearchFilters>(filters);

  if (!open) return null;

  const patch = (partial: Partial<SearchFilters>) =>
    setLocal((p) => ({ ...p, ...partial }));

  const handleReset = () => {
    onReset();
    onClose();
  };

  return (
    <Modal header="Фильтры поиска" onClose={onClose} className="w-xl">
      <div className="flex flex-col gap-3 p-2 overflow-y-auto">
        <p className="windows95-text text-text font-bold">Мин. сидеров</p>
        <Input
          type="number"
          min={0}
          placeholder="0 = все"
          className="w-24"
          value={local.minSeeders || ""}
          onChange={(e) =>
            patch({ minSeeders: Math.max(0, Number(e.target.value) || 0) })
          }
        />

        <hr className="windows95-header w-full" />

        <label className="flex items-center gap-2 cursor-pointer select-none windows95-text">
          <Checkbox
            checked={local.hasMagnet}
            onChange={(v) => patch({ hasMagnet: v })}
          />
          Только с магнитом
        </label>

        <hr className="windows95-header w-full" />

        <p className="windows95-text text-text font-bold">Качество</p>
        <Select
          className="w-full"
          value={local.quality}
          onChange={(v) => patch({ quality: v })}
          options={[
            { value: "all", label: "Любое" },
            { value: "1080p", label: "1080p" },
            { value: "720p", label: "720p" },
            { value: "480p", label: "480p" },
          ]}
        />

        <p className="windows95-text text-text font-bold">Язык</p>
        <Select
          className="w-full"
          value={local.language}
          onChange={(v) => patch({ language: v })}
          options={[
            { value: "all", label: "Любой" },
            { value: "ru", label: "Русский" },
            { value: "en", label: "Английский" },
            { value: "multi", label: "MultiSub" },
            { value: "dual", label: "Dual Audio" },
          ]}
        />

        <p className="windows95-text text-text font-bold">Кодек</p>
        <Select
          className="w-full"
          value={local.codec}
          onChange={(v) => patch({ codec: v })}
          options={[
            { value: "all", label: "Любой" },
            { value: "HEVC", label: "HEVC / x265" },
            { value: "x264", label: "x264" },
          ]}
        />

        <hr className="windows95-header w-full" />

        <p className="windows95-text text-text font-bold">Размер (MiB)</p>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            placeholder="от"
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
            placeholder="до"
            className="w-24"
            value={local.sizeMax || ""}
            onChange={(e) =>
              patch({ sizeMax: Math.max(0, Number(e.target.value) || 0) })
            }
          />
        </div>

        <div className="flex justify-end gap-1 mt-3">
          <Button variant="outline" onClick={handleReset}>
            Сбросить
          </Button>
          <Button
            onClick={() => {
              onApply(local);
              onClose();
            }}
          >
            Применить
          </Button>
        </div>
      </div>
    </Modal>
  );
}
