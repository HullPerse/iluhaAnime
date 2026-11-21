import { useDraggable, useDroppable } from "@dnd-kit/core";
import { cn } from "cn";
import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";

export default function MangaStatusRow({
  id,
  dragLabel,
  dragDisabled,
  editing,
  children,
}: {
  id: string;
  dragLabel: string;
  dragDisabled: boolean;
  editing: boolean;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id,
    disabled: dragDisabled,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id, disabled: dragDisabled });

  return (
    <li
      ref={(node) => {
        setNodeRef(node);
        setDropRef(node);
      }}
      aria-current={editing || undefined}
      className={cn(
        "windows95-border relative flex items-center gap-1 p-1",
        editing ? "bg-secondary text-title-text" : "bg-field",
        isDragging && "opacity-40",
        isOver && !isDragging && "outline-highlight outline-2 -outline-offset-2"
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        disabled={dragDisabled}
        aria-label={dragLabel}
        title={dragLabel}
        className="flex size-6 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing disabled:cursor-default disabled:opacity-50"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      {children}
    </li>
  );
}
