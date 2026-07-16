import type { SortKey } from "@/types";
import Select from "@/components/ui/select.component";

interface Props {
  sort: SortKey;
  onChange: (sort: SortKey) => void;
}

export default function SearchFiltersBar({ sort, onChange }: Props) {
  return (
    <section className="flex flex-row gap-2 w-full">
      <div className="flex items-center gap-1">
        <span className="text-text windows95-text">Сортировка:</span>
        <Select
          className="w-22"
          value={sort}
          onChange={(v) => onChange(v as SortKey)}
          options={[
            { value: "seeders", label: "Сидеры" },
            { value: "leechers", label: "Личи" },
            { value: "size", label: "Размер" },
          ]}
        />
      </div>
    </section>
  );
}
