import { mangaStatusColor } from "@/lib/manga/statusColor.utils";
import { useCell } from "@hullperse/hp_utils/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import {
  createMangaStatus,
  manageMangaStatus,
  mangaLibraryKey,
  type MangaStatus,
  type MangaStatusChange,
} from "@/api/manga.api";
import Modal from "@/components/shared/modal.component";
import Section from "@/components/shared/section.component";
import { Button } from "@/components/ui/button.component";
import { ColorPickerTrigger } from "@/components/ui/color/trigger.color";
import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/hooks/i18n.hook";
import MangaStatusList from "@/routes/components/manga/status/list.status";
import MangaStatusRow from "@/routes/components/manga/status/row.status";
import { MANGA_STATUS_CHIP_CLASS } from "@/routes/components/manga/card/tile.card";

import { patchSettings, settingsAtoms } from "@/store/settings.store";

const DEFAULT_COLOR = "#808080";

type StatusAction =
  | { kind: "create"; label: string; color: string }
  | { kind: "manage"; id: string; change: MangaStatusChange };

export default function MangaStatuses({
  statuses,
  onDeleted,
  onHide,
  onClose,
}: {
  statuses: readonly MangaStatus[];
  onHide: (id: string) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const hidden = useCell(settingsAtoms.mangaHiddenStatuses);
  const [editing, setEditing] = useState<string | null>(null);
  const [label, setLabel] = useState<string>("");
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const custom = statuses.filter((status) => status.id.startsWith("custom:"));

  function resetForm() {
    setEditing(null);
    setLabel("");
    setColor(DEFAULT_COLOR);
  }

  const mutation = useMutation({
    scope: { id: "manga-status" },
    mutationFn: (action: StatusAction) =>
      action.kind === "create"
        ? createMangaStatus(action)
        : manageMangaStatus(action.id, action.change),
    onSuccess: async (_, action) => {
      if (action.kind === "manage" && action.change.kind === "delete") {
        const hiddenStatuses = settingsAtoms.mangaHiddenStatuses.get();

        if (hiddenStatuses.includes(action.id)) {
          patchSettings({ mangaHiddenStatuses: hiddenStatuses.filter((id) => id !== action.id) });
        }

        onDeleted(action.id);

        if (editing === action.id) resetForm();
      }

      if (action.kind === "create" || action.change.kind === "edit") resetForm();
      await client.invalidateQueries({ queryKey: mangaLibraryKey });
    },
  });

  const busy = mutation.isPending;
  const dragDisabled = busy || custom.length < 2;

  return (
    <Modal
      header={t("manga.library.newStatus")}
      onClose={onClose}
      canClose={() => !busy}
      className="w-112 max-w-[94%]"
      contentClassName="[overflow-anchor:none]"
    >
      <form
        className="windows95-text grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();

          if (busy || !label.trim()) return;
          mutation.mutate(
            editing
              ? {
                  kind: "manage",
                  id: editing,
                  change: { kind: "edit", label, color: color.startsWith("#") ? color : null },
                }
              : { kind: "create", label, color }
          );
        }}
      >
        <label className="grid gap-1">
          <span className="font-bold">{t("manga.library.statusName")}</span>
          <Input
            name="label"
            maxLength={40}
            required
            value={label}
            disabled={busy}
            onChange={(event) => setLabel(event.currentTarget.value)}
          />
        </label>
        <div className="windows95-border bg-field flex items-center justify-between gap-2 p-2">
          <span className="font-bold">{t("manga.library.statusColor")}</span>
          <div className="flex items-center gap-2">
            {color.startsWith("#") && (
              <span className="text-hint font-mono uppercase">{color}</span>
            )}
            <ColorPickerTrigger
              label={t("manga.library.statusColor")}
              value={mangaStatusColor(color)}
              onChange={setColor}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={busy || !label.trim()}>
            {t(editing ? "manga.library.saveStatus" : "manga.library.addStatus")}
          </Button>
          <Button disabled={busy} onClick={editing ? resetForm : onClose}>
            {t(editing ? "common.cancel" : "common.close")}
          </Button>
        </div>
      </form>

      {custom.length > 0 && (
        <Section header={t("manga.library.customStatuses")} className="grid gap-1">
          <MangaStatusList
            statuses={custom}
            disabled={dragDisabled}
            renderRow={(item, index, move) => {
              const isHidden = hidden.includes(item.id);
              const VisibilityIcon = isHidden ? EyeOff : Eye;
              const visibilityLabel = t(
                isHidden ? "manga.library.showStatus" : "manga.library.hideStatus",
                { name: item.label }
              );

              return (
                <MangaStatusRow
                  key={item.id}
                  id={item.id}
                  dragLabel={t("manga.library.dragStatus", { name: item.label })}
                  dragDisabled={dragDisabled}
                  editing={editing === item.id}
                >
                  <span
                    aria-hidden
                    className={MANGA_STATUS_CHIP_CLASS}
                    style={{ backgroundColor: mangaStatusColor(item.color) }}
                  />
                  <span className="windows95-text min-w-0 flex-1 truncate" title={item.label}>
                    {item.label}
                  </span>
                  {([true, false] as const).map((up) => {
                    const Icon = up ? ChevronUp : ChevronDown;
                    const name = t(up ? "manga.library.moveUp" : "manga.library.moveDown", {
                      name: item.label,
                    });

                    return (
                      <Button
                        key={String(up)}
                        size="icon"
                        className="size-6 shrink-0"
                        aria-label={name}
                        title={name}
                        disabled={busy || (up ? index === 0 : index === custom.length - 1)}
                        onClick={() => move(up)}
                      >
                        <Icon className="size-4" />
                      </Button>
                    );
                  })}
                  <Button
                    size="icon"
                    className="size-6 shrink-0"
                    aria-label={visibilityLabel}
                    title={visibilityLabel}
                    disabled={busy}
                    onClick={() => {
                      const current = settingsAtoms.mangaHiddenStatuses.get();
                      patchSettings({
                        mangaHiddenStatuses: isHidden
                          ? current.filter((id) => id !== item.id)
                          : [...current, item.id],
                      });

                      if (!isHidden) onHide(item.id);
                    }}
                  >
                    <VisibilityIcon className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    className="size-6 shrink-0"
                    aria-label={t("manga.library.editStatus", { name: item.label })}
                    title={t("manga.library.editStatus", { name: item.label })}
                    aria-pressed={editing === item.id}
                    disabled={busy}
                    onClick={() => {
                      mutation.reset();
                      setEditing(item.id);
                      setLabel(item.label);
                      setColor(item.color);
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    className="size-6 shrink-0"
                    aria-label={t("manga.library.deleteStatus", { name: item.label })}
                    title={t("manga.library.deleteStatus", { name: item.label })}
                    disabled={busy}
                    onClick={() =>
                      mutation.mutate({ kind: "manage", id: item.id, change: { kind: "delete" } })
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </MangaStatusRow>
              );
            }}
          />
        </Section>
      )}
      {mutation.error && (
        <p className="windows95-text text-destructive" role="alert">
          {t("manga.library.statusFailed")}
        </p>
      )}
    </Modal>
  );
}
