import { X } from "lucide-react";

const chipClass =
  "windows95-border text-xs windows95-text inline-flex cursor-pointer items-center gap-0.5 bg-field px-1 hover:bg-surface";

import { useI18n } from "@/hooks/i18n.hook";
import { enterOrSpace } from "@/lib/keyboard.utils";

function ChipsRow({ items, onRemove }: { items: string[]; onRemove: (v: string) => void }) {
  const { t } = useI18n();
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((v) => (
        <span
          key={v}
          role="button"
          tabIndex={0}
          data-vim-target="chip"
          className={chipClass}
          onClick={() => onRemove(v)}
          onKeyDown={enterOrSpace(() => onRemove(v))}
          title={t("common.delete")}
        >
          {v} <X className="size-3" aria-hidden />
        </span>
      ))}
    </div>
  );
}

export default ChipsRow;
