import { Popover } from "@base-ui/react/popover";
import { Paintbrush, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/index.utils";
import type { CollectionStatusDef } from "@/types/collection";

const PRESET_COLORS = [
  "#9ca3af",
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
  "#0ea5e9",
  "#14b8a6",
  "#e879f9",
  "#facc15",
  "#f97316",
  "#64748b",
];

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

interface StatusManagerModalProps {
  statuses: CollectionStatusDef[];
  onUpsert: (status: CollectionStatusDef) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  onClose: () => void;
}

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  label: string;
}

function ColorPicker({ color, onChange, label }: ColorPickerProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState(color);

  const applyHex = () => {
    if (!HEX_PATTERN.test(hex)) return;
    onChange(hex.toLowerCase());
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={`${label} - ${t("collection.statusManager.color")}`}
        title={t("collection.statusManager.color")}
        className="windows95-border size-4 shrink-0 cursor-pointer"
        style={{ backgroundColor: color }}
      />
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={12}
          className="z-50 outline-none"
        >
          <Popover.Popup className="windows95-active-border bg-primary flex w-40 flex-col gap-1 p-1">
            <div className="grid grid-cols-6 gap-1">
              {PRESET_COLORS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-label={preset}
                  className={cn(
                    "windows95-border size-5 cursor-pointer",
                    preset.toLowerCase() === color.toLowerCase() &&
                      "outline-2 outline-white outline-dotted"
                  )}
                  style={{ backgroundColor: preset }}
                  onClick={() => {
                    onChange(preset);
                    setOpen(false);
                  }}
                />
              ))}
            </div>
            <div className="flex items-center gap-1">
              <Input
                value={hex}
                spellCheck={false}
                className="h-5 flex-1 font-mono text-xs"
                onChange={(e) => setHex(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyHex();
                }}
                placeholder="#22c55e"
                aria-label={t("collection.statusManager.hex")}
              />
              <Button
                size="icon"
                variant="default"
                disabled={!HEX_PATTERN.test(hex)}
                aria-label={t("collection.statusManager.apply")}
                onClick={applyHex}
              >
                <Paintbrush className="size-3" />
              </Button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function StatusManagerModal({
  statuses,
  onUpsert,
  onDelete,
  onClose,
}: StatusManagerModalProps) {
  const { t } = useI18n();
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("#0ea5e9");

  const addStatus = async () => {
    const label = newLabel.trim();
    if (!label || !HEX_PATTERN.test(newColor)) return;
    const id = `custom_${label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32)}_${Date.now().toString(36)}`;
    await onUpsert({
      id,
      label,
      color: newColor.toLowerCase(),
      order: statuses.length,
      isCore: false,
    });
    setNewLabel("");
  };

  return (
    <Modal
      header={t("collection.statusManager.title")}
      onClose={onClose}
      className="w-105"
      contentClassName="w-full"
    >
      <div className="flex w-full flex-col gap-1">
        <p className="text-hint windows95-font text-xs">
          {t("collection.statusManager.hint")}
        </p>
        <ul className="windows95-border flex max-h-64 flex-col overflow-y-auto bg-white">
          {statuses.map((status) => (
            <li
              key={status.id}
              className="border-b-muted flex items-center gap-1 border-b px-1 py-1 last:border-b-0"
            >
              <ColorPicker
                color={status.color}
                label={status.label}
                onChange={(color) => {
                  onUpsert({ ...status, color }).catch(() => {});
                }}
              />
              <Input
                defaultValue={status.label}
                disabled={status.isCore}
                className="h-5 flex-1 text-xs"
                spellCheck={false}
                aria-label={t("collection.statusManager.label")}
                onBlur={(e) => {
                  const label = e.target.value.trim();
                  if (label && label !== status.label) {
                    onUpsert({ ...status, label }).catch(() => {});
                  } else e.target.value = status.label;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
              />
              {status.isCore ? (
                <span className="text-hint windows95-font px-1 text-xs uppercase">
                  {t("collection.statusManager.core")}
                </span>
              ) : (
                <Button
                  size="icon"
                  variant="destructive"
                  aria-label={`${t("common.delete")} ${status.label}`}
                  title={t("collection.statusManager.deleteHint")}
                  onClick={() => onDelete(status.id).catch(() => {})}
                >
                  <Trash2 className="size-3" />
                </Button>
              )}
            </li>
          ))}
        </ul>
        <div className="windows95-border flex items-center gap-1 p-1">
          <ColorPicker
            color={newColor}
            label={t("collection.statusManager.new")}
            onChange={setNewColor}
          />
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addStatus().catch(() => {});
            }}
            placeholder={t("collection.statusManager.newPlaceholder")}
            aria-label={t("collection.statusManager.new")}
            className="h-5 flex-1 text-xs"
            spellCheck={false}
          />
          <Button
            size="icon"
            variant="success"
            disabled={!newLabel.trim()}
            aria-label={t("collection.statusManager.add")}
            onClick={() => addStatus().catch(() => {})}
          >
            <Plus className="size-3" />
          </Button>
        </div>
        <p className="text-hint windows95-font text-xs">
          {t("collection.statusManager.deleteNote")}
        </p>
      </div>
    </Modal>
  );
}
