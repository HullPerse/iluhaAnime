import { mangaStatusColor } from "@/lib/manga/statusColor.utils";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GripVertical } from "lucide-react";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { manageMangaStatus, mangaLibraryKey, type MangaStatus } from "@/api/manga.api";
import { useI18n } from "@/hooks/i18n.hook";
import { MANGA_STATUS_CHIP_CLASS } from "@/routes/components/manga/card/tile.card";

export default function MangaStatusList({
  statuses,
  disabled,
  renderRow,
}: {
  statuses: readonly MangaStatus[];
  disabled: boolean;
  renderRow: (item: MangaStatus, index: number, move: (up: boolean) => void) => ReactNode;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const reorder = useMutation({
    scope: { id: "manga-status" },
    mutationFn: ({
      id,
      target,
      up,
    }: {
      id: string;
      target: string;
      up?: boolean;
      rows: readonly MangaStatus[];
    }) =>
      manageMangaStatus(id, up === undefined ? { kind: "moveTo", target } : { kind: "move", up }),
    onSuccess: () => client.invalidateQueries({ queryKey: mangaLibraryKey }),
  });
  const rows = reorder.isPending ? (reorder.variables?.rows ?? statuses) : statuses;

  function move(id: string, target: string, up?: boolean) {
    if (disabled || reorder.isPending || id === target) return;
    const from = statuses.findIndex((item) => item.id === id);
    const to = statuses.findIndex((item) => item.id === target);
    const item = statuses[from];

    if (!item || to === -1) return;
    const next = [...statuses];
    next.splice(from, 1);
    next.splice(to, 0, item);
    reorder.mutate({ id, target, up, rows: next });
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (typeof active.id === "string" && typeof over?.id === "string") {
      move(active.id, over.id);
    }
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [draggedId, setDraggedId] = useState<string | number | null>(null);
  const dragged = statuses.find(({ id }) => id === draggedId);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={({ active }) => setDraggedId(active.id)}
      onDragCancel={() => setDraggedId(null)}
      onDragEnd={(event) => {
        setDraggedId(null);
        handleDragEnd(event);
      }}
    >
      <ul className="grid gap-1">
        {rows.map((item, index) =>
          renderRow(item, index, (up) => {
            const target = rows[index + (up ? -1 : 1)];

            if (target) move(item.id, target.id, up);
          })
        )}
      </ul>
      {reorder.error && (
        <p className="windows95-text text-destructive" role="alert">
          {t("manga.library.statusFailed")}
        </p>
      )}
      {typeof document !== "undefined" &&
        createPortal(
          <DragOverlay dropAnimation={null} zIndex={10000}>
            {dragged && (
              <div
                aria-hidden
                className="windows95-border bg-field pointer-events-none flex items-center gap-1 p-1"
              >
                <GripVertical className="mx-1 size-4 shrink-0" />
                <span
                  className={MANGA_STATUS_CHIP_CLASS}
                  style={{ backgroundColor: mangaStatusColor(dragged.color) }}
                />
                <span className="windows95-text min-w-0 truncate">{dragged.label}</span>
              </div>
            )}
          </DragOverlay>,
          document.body
        )}
    </DndContext>
  );
}
