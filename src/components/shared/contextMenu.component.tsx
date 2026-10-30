import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { cn } from "cn";
import { useCallback, useEffect, useRef, useState } from "react";

import { useI18n } from "@/hooks/i18n.hook";
import { registerContextMenuCloser } from "@/lib/ui/contextMenuClose.utils";
import { CONTEXT_MENU_POPUP_CLASS as POPUP_CLASS } from "@/lib/ui/contextMenuStyles.utils";
import { registerOverlay } from "@/store/overlay.store";
import type { ContextMenuProps } from "@/types/ui/contextMenu";

import { MenuEntries } from "@/components/shared/contextMenu/menuEntries.contextMenu";

export default function ContextMenu({
  entries,
  children,
  className,
  open,
  defaultOpen = false,
  onOpenChange,
}: ContextMenuProps) {
  const { t } = useI18n();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : uncontrolledOpen;
  const changeRef = useRef(onOpenChange);

  useEffect(() => {
    changeRef.current = onOpenChange;
  }, [onOpenChange]);

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      changeRef.current?.(next);
    },
    [isControlled]
  );

  const setOpenRef = useRef(setOpen);
  useEffect(() => {
    setOpenRef.current = setOpen;
  }, [setOpen]);
  useEffect(() => {
    const close = (): void => {
      setOpenRef.current(false);
    };
    return registerContextMenuCloser(close);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    return registerOverlay(() => setOpen(false));
  }, [isOpen, setOpen]);

  return (
    <ContextMenuPrimitive.Root open={isOpen} onOpenChange={(next) => setOpen(next)}>
      <ContextMenuPrimitive.Trigger className="contents">{children}</ContextMenuPrimitive.Trigger>
      <ContextMenuPrimitive.Portal>
        <ContextMenuPrimitive.Positioner className="z-50 outline-none">
          <ContextMenuPrimitive.Popup className={cn(POPUP_CLASS, className)}>
            <MenuEntries entries={entries} t={t} />
          </ContextMenuPrimitive.Popup>
        </ContextMenuPrimitive.Positioner>
      </ContextMenuPrimitive.Portal>
    </ContextMenuPrimitive.Root>
  );
}
