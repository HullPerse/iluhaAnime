import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";

import { HUE_GRADIENT } from "@/config/utils/colors.config";
import { useI18n } from "@/lib/locale/i18n.utils";
import { clamp, normalizeHue } from "@/lib/utils/color.utils";

export function HueSlider({ hue, onChange }: { hue: number; onChange: (hue: number) => void }) {
  const { t } = useI18n();
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const degrees = Math.round(hue);

  const setFromClientX = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      onChange(Math.round(clamp((clientX - rect.left) / rect.width, 0, 1) * 360));
    },
    [onChange]
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: MouseEvent) => setFromClientX(event.clientX);
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, setFromClientX]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 1;
    const moves: Record<string, number> = {
      ArrowDown: degrees - step,
      ArrowLeft: degrees - step,
      ArrowRight: degrees + step,
      ArrowUp: degrees + step,
      End: 360,
      Home: 0,
    };
    const move = moves[event.key];
    if (move === undefined) return;
    event.preventDefault();
    onChange(Math.round(clamp(move, 0, 360)));
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label={t("color.hue")}
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={degrees}
      aria-valuetext={t("color.hue.value", { hue: degrees })}
      className="windows95-border focus-visible:outline-text relative h-4 min-w-0 flex-1 cursor-pointer touch-none overflow-hidden focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted"
      style={{ background: HUE_GRADIENT }}
      onMouseDown={(event) => {
        event.preventDefault();
        event.currentTarget.focus();
        setDragging(true);
        setFromClientX(event.clientX);
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        className="bg-primary windows95-active-border pointer-events-none absolute inset-y-0 w-1 -translate-x-1/2"
        style={{ left: `${(normalizeHue(hue) / 360) * 100}%` }}
      />
    </div>
  );
}
