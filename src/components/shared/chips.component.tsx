const chipClass =
  "windows95-border px-1 text-xs windows95-text cursor-pointer hover:bg-surface bg-white";

import { useI18n } from "@/lib/i18n";

function ChipsRow({
  items,
  onRemove,
}: {
  items: string[];
  onRemove: (v: string) => void;
}) {
  const { t } = useI18n();
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((v) => (
        <span
          key={v}
          className={chipClass}
          onClick={() => onRemove(v)}
          title={t("common.delete")}
        >
          {v} ✕
        </span>
      ))}
    </div>
  );
}

export default ChipsRow;
