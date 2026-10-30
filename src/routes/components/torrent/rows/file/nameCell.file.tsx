import type { MouseEvent, ReactNode } from "react";

import ContextMenu from "@/components/shared/contextMenu.component";
import { enterOrSpace } from "@/lib/ui/keyboard.utils";
import type { ContextMenuEntry } from "@/types/ui/contextMenu";
import type { FileRowInteractions } from "@/types/core/fileRows";

export function FileNameCell({
  title,
  interactions,
  onActivate,
  onOpenFolder,
  menuEntries,
  onCtrlContextMenu,
  children,
}: {
  title: string;
  interactions: FileRowInteractions;
  onActivate: () => void;
  onOpenFolder: (event: MouseEvent) => void;
  menuEntries: ContextMenuEntry[] | null;
  onCtrlContextMenu: ((event: MouseEvent) => void) | null;
  children: ReactNode;
}) {
  const cell = (
    <span
      className="focus-visible:outline-text flex-1 truncate outline-none focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted"
      title={title}
      role={interactions.interactive ? "button" : undefined}
      tabIndex={interactions.interactive ? 0 : undefined}
      data-vim-target={interactions.interactive ? "file" : undefined}
      data-tree-activate={interactions.interactive ? "" : undefined}
      data-vim-contextmenu={interactions.contextMenu ? "file" : undefined}
      data-vim-ctrlclick={interactions.ctrlClick ? "file" : undefined}
      onKeyDown={interactions.interactive ? enterOrSpace(onActivate) : undefined}
      onContextMenu={menuEntries ? undefined : onOpenFolder}
      onContextMenuCapture={onCtrlContextMenu ?? undefined}
    >
      {children}
    </span>
  );
  if (!menuEntries) return cell;
  return <ContextMenu entries={menuEntries}>{cell}</ContextMenu>;
}
