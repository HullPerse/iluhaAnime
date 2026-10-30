import { GripVertical } from "lucide-react";
import type { PointerEvent } from "react";

export default function QueueGrip({
  onPointerDown,
  title,
}: {
  onPointerDown: (event: PointerEvent<HTMLSpanElement>) => void;
  title: string;
}) {
  return (
    <span
      data-testid="torrent-queue-handle"
      aria-hidden="true"
      tabIndex={-1}
      className="text-hint shrink-0 cursor-grab active:cursor-grabbing"
      style={{ touchAction: "none" }}
      title={title}
      onPointerDown={onPointerDown}
    >
      <GripVertical className="size-3" />
    </span>
  );
}
