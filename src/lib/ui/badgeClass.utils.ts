import type { HintBadgeLayout } from "@/types/core/hintsHotkeys";

export const badgeClass = (layout: HintBadgeLayout): string => {
  const base =
    "windows95-text absolute flex items-center gap-0.5 px-1 py-0.5 text-[11px] font-bold leading-none";
  return layout.variant === "plain"
    ? `${base} windows95-border bg-secondary text-title-text`
    : `${base} windows95-active-border bg-primary text-text`;
};
