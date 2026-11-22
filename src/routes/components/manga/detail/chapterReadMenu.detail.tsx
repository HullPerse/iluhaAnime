import { Check, ListChecks, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import ContextMenu from "@/components/shared/contextMenu.component";

export function ChapterReadMenu({
  read,
  pending,
  onToggle,
  onMarkPrevious,
  children,
}: {
  read: boolean;
  pending: boolean;
  onToggle: () => void;
  onMarkPrevious?: () => void;
  children: ReactNode;
}) {
  const toggleLabel = read ? "manga.details.markUnread" : "manga.details.markRead";

  return (
    <ContextMenu
      className="[&_[role=menuitem]]:py-0.5 [&_[role=menuitem]]:text-[max(10px,calc(var(--ui-font-size)-1px))]! [&_[role=menuitem]>span:first-child]:hidden"
      entries={[
        {
          kind: "item",
          id: "toggle-read",
          label: toggleLabel,
          icon: read ? RotateCcw : Check,
          onSelect: onToggle,
          disabled: pending,
        },
        {
          kind: "item",
          id: "mark-previous",
          label: "manga.details.markPreviousRead",
          icon: ListChecks,
          onSelect: () => onMarkPrevious?.(),
          disabled: pending || !onMarkPrevious,
        },
      ]}
    >
      {children}
    </ContextMenu>
  );
}
