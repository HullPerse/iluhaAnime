import { cn } from "cn";

export const CONTEXT_MENU_ITEM_CLASS = cn(
  "windows95-text windows95-border text-text data-highlighted:bg-highlight data-highlighted:text-white",
  "data-[variant=destructive]:text-destructive data-[variant=destructive]:data-highlighted:bg-destructive data-[variant=destructive]:data-highlighted:text-white",
  "data-disabled:pointer-events-none data-disabled:opacity-50",
  "relative flex cursor-pointer items-center gap-1.5 px-1.5 py-1 text-sm outline-none select-none"
);

export const CONTEXT_MENU_POPUP_CLASS = cn(
  "windows95-active-border bg-field flex max-h-[min(16rem,var(--available-height))] min-w-32 flex-col overflow-hidden outline-none"
);
