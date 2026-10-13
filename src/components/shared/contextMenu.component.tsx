import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { cn } from "cn";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ComponentType, ReactNode } from "react";

import { useI18n } from "@/hooks/i18n.hook";
import { registerOverlay } from "@/store/overlay.store";
import type { TranslationKey } from "@/types/i18n";

export interface ContextMenuItem {
  kind: "item";
  id: string;
  label: TranslationKey;
  icon?: ComponentType<{ className?: string }>;
  onSelect: () => void;
  disabled?: boolean;
  variant?: "default" | "destructive";
}

export interface ContextMenuSeparator {
  kind: "separator";
  id: string;
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator;

export interface ContextMenuProps {
  entries: readonly ContextMenuEntry[];
  children: ReactNode;
  className?: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const ITEM_CLASS = cn(
  "windows95-text windows95-border text-text data-highlighted:bg-highlight data-highlighted:text-white",
  "data-[variant=destructive]:text-destructive data-[variant=destructive]:data-highlighted:bg-destructive data-[variant=destructive]:data-highlighted:text-white",
  "data-disabled:pointer-events-none data-disabled:opacity-50",
  "relative flex cursor-pointer items-center gap-1.5 px-1.5 py-1 text-sm outline-none select-none"
);

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

  // Esc unwinds through the shared overlay stack like every other overlay.
  useEffect(() => {
    if (!isOpen) return;
    return registerOverlay(() => setOpen(false));
  }, [isOpen, setOpen]);

  return (
    <ContextMenuPrimitive.Root open={isOpen} onOpenChange={(next) => setOpen(next)}>
      <ContextMenuPrimitive.Trigger className="contents">{children}</ContextMenuPrimitive.Trigger>
      <ContextMenuPrimitive.Portal>
        <ContextMenuPrimitive.Positioner className="z-50 outline-none">
          <ContextMenuPrimitive.Popup
            className={cn(
              "windows95-active-border bg-field flex max-h-[min(16rem,var(--available-height))] min-w-32 flex-col overflow-hidden outline-none",
              className
            )}
          >
            {entries.map((entry) =>
              entry.kind === "separator" ? (
                <ContextMenuPrimitive.Separator
                  key={entry.id}
                  className="bg-secondary mx-1 my-1 h-px"
                />
              ) : (
                <ContextMenuPrimitive.Item
                  key={entry.id}
                  disabled={entry.disabled}
                  data-variant={entry.variant ?? "default"}
                  className={ITEM_CLASS}
                  onClick={() => entry.onSelect()}
                >
                  {entry.icon ? <entry.icon className="size-3.5 shrink-0" /> : null}
                  <span className="truncate">{t(entry.label)}</span>
                </ContextMenuPrimitive.Item>
              )
            )}
          </ContextMenuPrimitive.Popup>
        </ContextMenuPrimitive.Positioner>
      </ContextMenuPrimitive.Portal>
    </ContextMenuPrimitive.Root>
  );
}
