import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";

import {
  CONTEXT_MENU_ITEM_CLASS as ITEM_CLASS,
  CONTEXT_MENU_POPUP_CLASS as POPUP_CLASS,
} from "@/lib/ui/contextMenuStyles.utils";
import type { ContextMenuEntry } from "@/types/ui/contextMenu";
import type { TFunc } from "@/types/core/i18n";

import { EntryLabel } from "@/components/shared/contextMenu/entryLabel.contextMenu";

export function MenuEntries({ entries, t }: { entries: readonly ContextMenuEntry[]; t: TFunc }) {
  return (
    <>
      {entries.map((entry) => {
        if (entry.kind === "separator") {
          return (
            <ContextMenuPrimitive.Separator
              key={entry.id}
              className="bg-secondary mx-1 my-1 h-px"
            />
          );
        }
        if (entry.kind === "submenu") {
          const text = entry.rawText ?? t(entry.label, entry.labelVars);
          return (
            <ContextMenuPrimitive.SubmenuRoot key={entry.id}>
              <ContextMenuPrimitive.SubmenuTrigger disabled={entry.disabled} className={ITEM_CLASS}>
                <EntryLabel icon={entry.icon} text={text} hint={entry.hint} chevron />
              </ContextMenuPrimitive.SubmenuTrigger>
              <ContextMenuPrimitive.Portal>
                <ContextMenuPrimitive.Positioner className="z-50 outline-none">
                  <ContextMenuPrimitive.Popup className={POPUP_CLASS}>
                    <MenuEntries entries={entry.entries} t={t} />
                  </ContextMenuPrimitive.Popup>
                </ContextMenuPrimitive.Positioner>
              </ContextMenuPrimitive.Portal>
            </ContextMenuPrimitive.SubmenuRoot>
          );
        }
        const text = entry.rawText ?? t(entry.label, entry.labelVars);
        return (
          <ContextMenuPrimitive.Item
            key={entry.id}
            disabled={entry.disabled}
            data-variant={entry.variant ?? "default"}
            className={ITEM_CLASS}
            onClick={() => entry.onSelect()}
          >
            <EntryLabel icon={entry.icon} text={text} hint={entry.hint} checked={entry.checked} />
          </ContextMenuPrimitive.Item>
        );
      })}
    </>
  );
}
