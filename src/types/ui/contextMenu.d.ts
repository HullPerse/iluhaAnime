import type { TranslationKey, TranslationVariables } from "@/types/core/i18n";
import type { ComponentType, ReactNode } from "react";

export interface ContextMenuItem {
  kind: "item";
  id: string;
  label: TranslationKey;
  labelVars?: TranslationVariables;
  rawText?: string;
  icon?: ComponentType<{ className?: string }>;
  hint?: string;
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

export interface ContextMenuProps {
  entries: readonly ContextMenuEntry[];
  children: ReactNode;
  className?: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}
