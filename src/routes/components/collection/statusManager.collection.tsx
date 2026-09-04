import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { ColorPickerTrigger } from "@/components/ui/color.component";
import { Input } from "@/components/ui/input.component";
import { buildCustomStatusId } from "@/lib/collection.utils";
import { useI18n } from "@/lib/i18n";
import type { CollectionStatusDef } from "@/types/collection";

const DEFAULT_NEW_COLOR = "#0ea5e9";

function StatusRow({
  status,
  onUpsert,
  onDelete,
}: {
  status: CollectionStatusDef;
  onUpsert: (status: CollectionStatusDef) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useI18n();

  return (
    <li className="border-b-muted flex items-center gap-1 border-b px-1 py-1 last:border-b-0">
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
        onBlur={(e) => {
          const label = e.target.value.trim();
          if (label && label !== status.label) onUpsert({ ...status, label });
          else e.target.value = status.label;
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
          onClick={() => onDelete(status.id)}
        >
          <Trash2 className="size-3" />
        </Button>
      )}
    </li>
  );
}

export function StatusManagerCollection({
  statuses,
  onUpsert,
  onDelete,
  onClose,
}: {
  statuses: CollectionStatusDef[];
  onUpsert: (status: CollectionStatusDef) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_NEW_COLOR);

  const addStatus = () => {
    const id = buildCustomStatusId(newLabel);
    if (!id) return;
    const order = statuses.reduce((max, s) => Math.max(max, s.order), 0) + 1;
    onUpsert({ id, label: newLabel.trim(), color: newColor, order, isCore: false });
    setNewLabel("");
  };

  return (
    <Modal
      header={t("collection.status.manager.title")}
      onClose={onClose}
      className="w-105"
      contentClassName="w-full"
    >
      <div className="flex w-full flex-col gap-1">
        <p className="text-hint windows95-font text-xs">{t("collection.status.manager.hint")}</p>
        <ul className="windows95-border flex max-h-64 flex-col overflow-y-auto bg-white">
          {statuses.map((status) => (
            <StatusRow key={status.id} status={status} onUpsert={onUpsert} onDelete={onDelete} />
          ))}
        </ul>
        <div className="windows95-border flex items-center gap-1 p-1">
          <ColorPickerTrigger value={newColor} onChange={setNewColor} />
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addStatus();
            }}
            placeholder={t("collection.status.manager.new.placeholder")}
            aria-label={t("collection.status.manager.new")}
            className="h-5 flex-1 text-xs"
            spellCheck={false}
          />
          <Button
            size="icon"
            variant="success"
            disabled={!newLabel.trim()}
            aria-label={t("collection.status.manager.add")}
            onClick={addStatus}
          >
            <Plus className="size-3" />
          </Button>
        </div>
        <p className="text-hint windows95-font text-xs">
          {t("collection.status.manager.delete.note")}
        </p>
      </div>
    </Modal>
  );
}
