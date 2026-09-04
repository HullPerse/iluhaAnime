import { X } from "lucide-react";

const chipClass =
  "windows95-border text-xs windows95-text inline-flex cursor-pointer items-center gap-0.5 bg-white px-1 hover:bg-surface";

import { useI18n } from "@/lib/i18n";

function ChipsRow({ items, onRemove }: { items: string[]; onRemove: (v: string) => void }) {
  const { t } = useI18n();
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((v) => (
        <span key={v} className={chipClass} onClick={() => onRemove(v)} title={t("common.delete")}>
          {v} <X className="size-3" aria-hidden />
        </span>
      ))}
    </div>
  );
}

export default ChipsRow;
