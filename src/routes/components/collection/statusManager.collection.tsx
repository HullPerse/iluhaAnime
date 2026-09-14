import { Plus } from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm.component";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { ColorPickerTrigger } from "@/components/ui/color/trigger.color";
import { Input } from "@/components/ui/input.component";
import Select from "@/components/ui/select.component";
import { DEFAULT_NEW_COLOR, PUBLIC_STATUS_MAX_ITEMS } from "@/config/collection/statuses.config";
import { buildCustomStatusId, normalizeStatusLabel } from "@/lib/collection/status.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { CollectionStatusDef, CollectionStatusKind } from "@/types/collection";

import { BilingualPreview } from "./bilingualPreview.collection";
import { StatusRow } from "./statusRow.collection";

export function StatusManagerCollection({
  statuses,
  counts,
  onUpsert,
  onDelete,
  onClose,
}: {
  statuses: CollectionStatusDef[];
  counts?: Record<string, number>;
  onUpsert: (status: CollectionStatusDef) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_NEW_COLOR);
  const [newKind, setNewKind] = useState<CollectionStatusKind>("private");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const newId = buildCustomStatusId(newLabel);
  const duplicateId = newId !== "" && statuses.some((s) => s.id === newId);

  const addStatus = () => {
    const label = normalizeStatusLabel(newLabel);
    if (!label) return;
    const id = buildCustomStatusId(label);
    const order =
      statuses.reduce((max, s) => (Number.isFinite(s.order) ? Math.max(max, s.order) : max), 0) + 1;
    onUpsert({ id, label, color: newColor, order, isCore: false, kind: newKind });
    setNewLabel("");
    setNewKind("private");
  };

  return (
    <Modal
      header={t("collection.status.manager.title")}
      onClose={onClose}
      className="w-105"
      contentClassName="w-full"
    >
      <div className="flex w-full flex-col gap-1">
        <p className="bg-secondary windows95-text px-1 py-0.5 text-xs font-bold text-white">
          {t("collection.status.manager.core.title")}
        </p>
        <ul className="windows95-border flex max-h-64 flex-col overflow-y-auto bg-white">
          {statuses
            .filter((status) => status.isCore)
            .map((status) => (
              <StatusRow
                key={status.id}
                status={status}
                count={counts?.[status.id]}
                onUpsert={onUpsert}
                onDelete={setPendingDelete}
              />
            ))}
        </ul>
        <p className="bg-secondary windows95-text flex items-center gap-1 px-1 py-0.5 text-xs font-bold text-white">
          <span className="flex-1">{t("collection.status.manager.custom.title")}</span>
          <span aria-hidden>({statuses.filter((status) => !status.isCore).length})</span>
        </p>
        <ul className="windows95-border bg-surface flex max-h-64 flex-col gap-1 overflow-y-auto p-1">
          {statuses
            .filter((status) => !status.isCore)
            .map((status) => (
              <StatusRow
                key={status.id}
                status={status}
                count={counts?.[status.id]}
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
            className="h-5 min-w-32 flex-1 text-xs"
            spellCheck={false}
          />
          <Select
            className="w-24"
            value={newKind}
            label={t("collection.status.manager.kind")}
            onChange={(value) => setNewKind(value as CollectionStatusKind)}
            options={[
              { value: "private", label: t("collection.status.manager.kind.private") },
              { value: "public", label: t("collection.status.manager.kind.public") },
            ]}
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
          {newKind === "public"
            ? t("collection.status.manager.kind.public.hint", {
                max: String(PUBLIC_STATUS_MAX_ITEMS),
              })
            : t("collection.status.manager.delete.note")}
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
