import type { TranslationKey, TranslationVariables } from "@/types/i18n";
import type { ComponentType, ReactNode } from "react";

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

export interface ContextMenuProps {
  entries: readonly ContextMenuEntry[];
  children: ReactNode;
  className?: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}
