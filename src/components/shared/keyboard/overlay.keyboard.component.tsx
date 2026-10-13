import { Menu, MousePointerClick, TextCursorInput } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useI18n } from "@/hooks/i18n.hook";
import {
  hintLayoutsEqual,
  measureBadgeLayouts,
  resolveBadgeCollisions,
} from "@/lib/hotkeys/hints.hotkeys";
import type { HintBadgeLayout } from "@/lib/hotkeys/hints.hotkeys";
import { useCell } from "@/lib/state/signal.hook";
import { vimAtoms } from "@/store/vim.store";

function badgeClass(layout: HintBadgeLayout): string {
  const base =
    "windows95-text absolute flex items-center gap-0.5 px-1 py-0.5 text-[11px] font-bold leading-none";
  return layout.variant === "plain"
    ? `${base} windows95-border bg-secondary text-title-text`
    : `${base} windows95-active-border bg-primary text-text`;
}

export default function KeyboardHintOverlay() {
  const { t } = useI18n();
  const hints = useCell(vimAtoms.hints);
  const [layouts, setLayouts] = useState<HintBadgeLayout[]>([]);

  useEffect(() => {
    if (!hints.open) {
      setLayouts([]);
      return;
    }
    const measure = () => {
      const next = resolveBadgeCollisions(measureBadgeLayouts(hints.badges, hints.pinned, t));
      setLayouts((prev) => (hintLayoutsEqual(prev, next) ? prev : next));
    };
    measure();
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    // Only layout-affecting attribute churn is worth a remeasure; aria/data
    // toggles (and our own class add on the pinned target) are filtered out
    // at the observer level so unrelated app updates cannot reschedule.
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    return () => {
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [hints.open, hints.badges, hints.pinned, t]);

  useEffect(() => {
    if (!hints.open || hints.pinned === null) return;
    const element = hints.badges.find((badge) => badge.label === hints.pinned)?.element;
    if (!element) return;
    element.classList.add("target-marked");
    return () => element.classList.remove("target-marked");
  }, [hints.open, hints.pinned, hints.badges]);

  if (typeof document === "undefined" || !hints.open || layouts.length === 0) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[60]" aria-hidden="true">
      {layouts.map((layout) => (
        <span
          key={layout.label}
          className={badgeClass(layout)}
          style={{ top: layout.top, left: layout.left, zIndex: layout.pinned ? 2 : 1 }}
        >
          {layout.pinned && layout.description ? (
            <span className="max-w-64 truncate">{layout.description}</span>
          ) : (
            <>
              <span>{layout.label}</span>
              {layout.variant === "ctrl" && <MousePointerClick className="size-2.5" />}
              {layout.variant === "contextmenu" && <Menu className="size-2.5" />}
              {layout.variant === "focus" && <TextCursorInput className="size-2.5" />}
            </>
          )}
        </span>
      ))}
      {hints.overflow > 0 && (
        <span className="windows95-text windows95-border bg-secondary text-title-text absolute right-2 bottom-2 px-1 py-0.5 text-[11px]">
          {t("keybind.vim.overflow", { count: hints.overflow })}
        </span>
      )}
    </div>,
    document.body
  );
}
