import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useI18n } from "@/lib/locale/i18n.utils";

export function suffixText(suffix: ReactNode): string {
  return typeof suffix === "string" ? suffix : "";
}

function Slider({
  wheel,
  label,
  min,
  max,
  step,
  value,
  suffix,
  onChange,
}: {
  label?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  suffix?: ReactNode;
  wheel?: boolean;
  onChange: (v: number) => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const clamped = Math.max(min, Math.min(max, value));
  const pct = (clamped - min) / (max - min);

  const setFromClientX = useCallback(
    (clientX: number) => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const raw = (clientX - rect.left) / rect.width;
      const clamped = Math.max(0, Math.min(1, raw));
      const stepped = Math.round((min + clamped * (max - min)) / step) * step;
      onChange(Math.max(min, Math.min(max, stepped)));
    },
    [min, max, step, onChange]
  );

  const adjustWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const amount = (e.shiftKey ? step * 10 : step) * (e.deltaY > 0 ? -1 : 1);
      onChange(Math.max(min, Math.min(max, clamped + amount)));
    },
    [min, max, step, clamped, onChange]
  );

  useEffect(() => {
    if (!wheel) return;
    const el = ref.current;
    if (!el) return;
    el.addEventListener("wheel", adjustWheel, { passive: false });
    return () => el.removeEventListener("wheel", adjustWheel);
  }, [wheel, adjustWheel]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => setFromClientX(e.clientX);
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, setFromClientX]);

  return (
    <div className="flex items-center gap-1 select-none">
      {label && <span className="w-24 shrink-0 text-xs">{label}</span>}
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label={label ?? t("common.slider")}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={clamped}
        aria-valuetext={`${clamped}${suffixText(suffix)}`}
        className="windows95-border relative h-4 flex-1 cursor-pointer bg-white"
        onKeyDown={(e) => {
          const amount = e.shiftKey ? step * 10 : step;

          const keyMap: Record<string, () => void> = {
            ArrowLeft: () => onChange(Math.max(min, clamped - amount)),
            ArrowDown: () => onChange(Math.max(min, clamped - amount)),
            ArrowRight: () => onChange(Math.min(max, clamped + amount)),
            ArrowUp: () => onChange(Math.min(max, clamped + amount)),
            Home: () => onChange(min),
            End: () => onChange(max),
          };

          const keyAction = keyMap[e.key];
          if (!keyAction) return;

          e.preventDefault();
          keyAction();
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.currentTarget.focus();
          setDragging(true);
          setFromClientX(e.clientX);
        }}
      >
        <div
          className="bg-highlight absolute inset-y-0 left-0"
          style={{ width: `${pct * 100}%` }}
        />
        <div
          className="bg-primary windows95-active-border pointer-events-none absolute top-0 bottom-0 w-2"
          style={{ left: `${pct * 100}%`, transform: "translateX(-50%)" }}
        />
      </div>
      <span className="inline-flex w-10 items-center justify-end gap-0.5 text-right tabular-nums">
        {Math.floor((100 * Number(clamped.toFixed(2))) / max)}
        {suffix}
      </span>
    </div>
  );
}
export default Slider;
