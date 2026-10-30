import { X } from "lucide-react";

import { useI18n } from "@/hooks/i18n.hook";
import { chipClass } from "@/lib/ui/chip.utils";
import { enterOrSpace } from "@/lib/ui/keyboard.utils";

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
