import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm.component";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { ColorPickerTrigger } from "@/components/ui/color.component";
import { Input } from "@/components/ui/input.component";
import { DEFAULT_NEW_COLOR } from "@/config/collection/statuses.config";
import {
  buildCustomStatusId,
  normalizeStatusLabel,
  splitStatusLabel,
} from "@/lib/collection/status.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { CollectionStatusDef } from "@/types/collection";

function BilingualPreview({ value }: { value: string }) {
  if (!value.includes(",")) return null;
  const parts = splitStatusLabel(value);
  if (!parts.en && !parts.ru) return null;
  return (
    <span
      className="flex w-full flex-wrap items-center gap-1 pt-0.5 text-xs"
      aria-live="polite"
    >
      <span className="windows95-border bg-surface px-1">EN: {parts.en || "-"}</span>
      <span className="windows95-border bg-white px-1">RU: {parts.ru || "-"}</span>
    </span>
  );
}

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
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const newId = buildCustomStatusId(newLabel);
  const duplicateId = newId !== "" && statuses.some((s) => s.id === newId);

  const addStatus = () => {
    const label = normalizeStatusLabel(newLabel);
    if (!label) return;
    const id = buildCustomStatusId(label);
    const order = statuses.reduce((max, s) => Math.max(max, s.order), 0) + 1;
    onUpsert({ id, label, color: newColor, order, isCore: false });
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
        <p className="text-hint windows95-font text-xs">{t("collection.status.manager.bilingual")}</p>
        <ul className="windows95-border flex max-h-64 flex-col overflow-y-auto bg-white">
          {statuses.map((status) => (
            <StatusRow
              key={status.id}
              status={status}
              onUpsert={onUpsert}
              onDelete={setPendingDelete}
            />
          ))}
        </ul>
        <div className="windows95-border flex flex-wrap items-center gap-1 p-1">
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
            disabled={!newLabel.trim() || duplicateId}
            title={duplicateId ? t("collection.status.manager.delete.note") : undefined}
            aria-label={t("collection.status.manager.add")}
            onClick={addStatus}
          >
            <Plus className="size-3" />
          </Button>
          <BilingualPreview value={newLabel} />
        </div>
        <p className="text-hint windows95-font text-xs">
          {t("collection.status.manager.delete.note")}
        </p>
      </div>
      {pendingDelete && (
        <ConfirmDialog
          open
          title={t("collection.status.manager.delete.title")}
          message={t("collection.status.manager.delete.message")}
          confirmLabel={t("common.delete")}
          variant="destructive"
          onConfirm={() => {
            onDelete(pendingDelete);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </Modal>
  );
}
