import { Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button.component";
import { ColorPickerTrigger } from "@/components/ui/color/trigger.color";
import { Input } from "@/components/ui/input.component";
import { normalizeStatusLabel } from "@/lib/collection/status.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { CollectionStatusDef } from "@/types/collection";

import { BilingualPreview } from "./bilingualPreview.collection";

export function StatusRow({
  status,
  onUpsert,
  onDelete,
}: {
  status: CollectionStatusDef;
  onUpsert: (status: CollectionStatusDef) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(status.label);

  return (
    <li className="border-b-muted flex flex-wrap items-center gap-1 border-b px-1 py-1 last:border-b-0">
      <ColorPickerTrigger
        value={status.color}
        onChange={(color) => onUpsert({ ...status, color })}
      />
      <Input
        defaultValue={status.label}
        disabled={status.isCore}
        className="h-5 flex-1 text-xs"
        spellCheck={false}
        aria-label={t("collection.status.manager.label")}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => {
          const label = normalizeStatusLabel(e.target.value);
          if (label && label !== status.label) {
            e.target.value = label;
            setDraft(label);
            onUpsert({ ...status, label });
          } else {
            e.target.value = status.label;
            setDraft(status.label);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      {status.isCore ? (
        <span className="text-hint windows95-font px-1 text-xs uppercase">
          {t("collection.status.manager.core")}
        </span>
      ) : (
        <Button
          size="icon"
          variant="destructive"
          aria-label={`${t("common.delete")} ${status.label}`}
          title={t("collection.status.manager.delete.hint")}
          className="size-6"
          onClick={(e) => {
            if (e.currentTarget.ownerDocument.activeElement instanceof HTMLInputElement) {
              e.currentTarget.ownerDocument.activeElement.blur();
            }
            onDelete(status.id);
          }}
        >
          <Trash2 className="size-3" />
        </Button>
      )}
      <BilingualPreview value={draft} />
    </li>
  );
}
