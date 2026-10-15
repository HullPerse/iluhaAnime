import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { cn } from "cn";
import { ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ComponentType, ReactNode } from "react";

import { useI18n } from "@/hooks/i18n.hook";
import { registerOverlay } from "@/store/overlay.store";
import type { TFunc, TranslationKey, TranslationVariables } from "@/types/i18n";

export interface ContextMenuItem {
  kind: "item";
  id: string;
  label: TranslationKey;
  /** Interpolation for label, e.g. chapter numbers. */
  labelVars?: TranslationVariables;
  /** Dynamic data text (track names, chapter titles). Static UI copy stays in label. */
  rawText?: string;
  icon?: ComponentType<{ className?: string }>;
  /** Right-aligned hotkey hint, e.g. "Space". */
  hint?: string;
  /** Selected-state dot, e.g. the active track. Never the only state signal alone. */
  checked?: boolean;
  onSelect: () => void;
  disabled?: boolean;
  variant?: "default" | "destructive";
}

export interface ContextMenuSubmenu {
  kind: "submenu";
  id: string;
  label: TranslationKey;
  labelVars?: TranslationVariables;
  rawText?: string;
  icon?: ComponentType<{ className?: string }>;
  hint?: string;
  disabled?: boolean;
  entries: readonly ContextMenuEntry[];
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSubmenu | ContextMenuSeparator;

export interface ContextMenuSeparator {
  kind: "separator";
  id: string;
}

const menuClosers = new Set<() => void>();

export function closeOpenContextMenus(): void {
  for (const close of menuClosers) close();
}

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

const POPUP_CLASS = cn(
  "windows95-active-border bg-field flex max-h-[min(16rem,var(--available-height))] min-w-32 flex-col overflow-hidden outline-none"
);

function EntryLabel({
  icon: Icon,
  text,
  hint,
  checked,
  chevron,
}: {
  icon?: ComponentType<{ className?: string }>;
  text: string;
  hint?: string;
  checked?: boolean;
  chevron?: boolean;
}) {
  return (
    <>
      <span className="flex size-3.5 shrink-0 items-center justify-center" aria-hidden="true">
        {checked === true ? <span className="size-1.5 bg-current" /> : null}
      </span>
      {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
      <span className="truncate">{text}</span>
      {hint ? <span className="text-hint ml-auto pl-4 text-xs">{hint}</span> : null}
      {chevron === true ? <ChevronRight className="ml-auto size-3.5 shrink-0" /> : null}
    </>
  );
}

function MenuEntries({ entries, t }: { entries: readonly ContextMenuEntry[]; t: TFunc }) {
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
              <ContextMenuPrimitive.SubmenuTrigger
                disabled={entry.disabled}
                className={ITEM_CLASS}
              >
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
            <EntryLabel
              icon={entry.icon}
              text={text}
              hint={entry.hint}
              checked={entry.checked}
            />
          </ContextMenuPrimitive.Item>
        );
      })}
    </>
  );
}

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
    menuClosers.add(close);
    return () => {
      menuClosers.delete(close);
    };
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
          <ContextMenuPrimitive.Popup
            className={cn(
              POPUP_CLASS,
              className
            )}
          >
            <MenuEntries entries={entries} t={t} />
          </ContextMenuPrimitive.Popup>
        </ContextMenuPrimitive.Positioner>
      </ContextMenuPrimitive.Portal>
    </ContextMenuPrimitive.Root>
  );
}
