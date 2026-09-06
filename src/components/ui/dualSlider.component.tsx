import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useI18n } from "@/lib/locale/i18n.utils";

import { suffixText } from "./range.component";

export function DualSlider({
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
  value: [number, number];
  suffix?: ReactNode;
  wheel?: boolean;
  onChange: (v: [number, number]) => void;
}) {
  const { t } = useI18n();
  const sliderLabel = label ?? t("common.slider");
  const ref = useRef<HTMLDivElement>(null);
  const [dragTarget, setDragTarget] = useState<"min" | "max" | null>(null);
  const low = ((value[0] - min) / (max - min)) * 100;
  const high = ((value[1] - min) / (max - min)) * 100;

  const setFromClientX = useCallback(
    (clientX: number, target: "min" | "max") => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const raw = (clientX - rect.left) / rect.width;
      const clamped = Math.max(0, Math.min(1, raw));
      const stepped = Math.round((min + clamped * (max - min)) / step) * step;
      const nv = Math.max(min, Math.min(max, stepped));
      if (target === "min") {
        onChange([Math.min(nv, value[1]), value[1]]);
      } else {
        onChange([value[0], Math.max(nv, value[0])]);
      }
    },
    [min, max, step, value, onChange]
  );

  const adjustWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const base = e.shiftKey ? step * 10 : step;
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      const raw = (e.clientX - rect.left) / rect.width;
      const mid = (low + high) / 200;
      if (raw < mid) {
        const amount = base * (e.deltaY > 0 ? 1 : -1);
        onChange([Math.max(min, Math.min(value[1], value[0] + amount)), value[1]]);
      } else {
        const amount = base * (e.deltaY > 0 ? -1 : 1);
        onChange([value[0], Math.max(value[0], Math.min(max, value[1] + amount))]);
      }
    },
    [min, max, step, value, low, high, onChange]
  );

  useEffect(() => {
    if (!wheel) return;
    const el = ref.current;
    if (!el) return;
    el.addEventListener("wheel", adjustWheel, { passive: false });
    return () => el.removeEventListener("wheel", adjustWheel);
  }, [wheel, adjustWheel]);

  useEffect(() => {
    if (!dragTarget) return;
    const onMove = (e: MouseEvent) => setFromClientX(e.clientX, dragTarget);
    const onUp = () => setDragTarget(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragTarget, setFromClientX]);

  return (
    <div className="flex items-center gap-1 select-none" role="group" aria-label={sliderLabel}>
      {label && <span className="w-24 shrink-0 text-xs">{label}</span>}
      <div
        ref={ref}
        className="windows95-border relative h-4 flex-1 cursor-pointer bg-white"
        onMouseDown={(e) => {
          e.preventDefault();
          const rect = ref.current?.getBoundingClientRect();
          if (!rect) return;
          const raw = (e.clientX - rect.left) / rect.width;
          const mid = (low + high) / 200;
          setDragTarget(raw < mid ? "min" : "max");
          setFromClientX(e.clientX, raw < mid ? "min" : "max");
        }}
      >
        <div
          className="bg-highlight absolute inset-y-0"
          style={{ left: `${low}%`, right: `${100 - high}%` }}
        />
        <button
          type="button"
          role="slider"
          aria-label={`${sliderLabel} ${t("common.minimum")}`}
          aria-valuemin={min}
          aria-valuemax={value[1]}
          aria-valuenow={value[0]}
          aria-valuetext={`${value[0]}${suffixText(suffix)}`}
          className="bg-primary windows95-active-border absolute top-0 bottom-0 w-3 cursor-pointer"
          style={{ left: `${low}%`, transform: "translateX(-50%)" }}
          onMouseDown={(e) => {
            e.stopPropagation();
            setDragTarget("min");
          }}
          onKeyDown={(e) => {
            const amount = e.shiftKey ? step * 10 : step;
            const keyMap: Record<string, () => void> = {
              ArrowLeft: () => onChange([Math.max(min, value[0] - amount), value[1]]),
              ArrowDown: () => onChange([Math.max(min, value[0] - amount), value[1]]),
              ArrowRight: () => onChange([Math.min(value[1], value[0] + amount), value[1]]),
              ArrowUp: () => onChange([Math.min(value[1], value[0] + amount), value[1]]),
              Home: () => onChange([min, value[1]]),
            };
            const keyAction = keyMap[e.key];
            if (!keyAction) return;
            e.preventDefault();
            keyAction();
          }}
        />
        <button
          type="button"
          role="slider"
          aria-label={`${sliderLabel} ${t("common.maximum")}`}
          aria-valuemin={value[0]}
          aria-valuemax={max}
          aria-valuenow={value[1]}
          aria-valuetext={`${value[1]}${suffixText(suffix)}`}
          className="bg-primary windows95-active-border absolute top-0 bottom-0 w-3 cursor-pointer"
          style={{ left: `${high}%`, transform: "translateX(-50%)" }}
          onMouseDown={(e) => {
            e.stopPropagation();
            setDragTarget("max");
          }}
          onKeyDown={(e) => {
            const amount = e.shiftKey ? step * 10 : step;
            const keyMap: Record<string, () => void> = {
              ArrowLeft: () => onChange([value[0], Math.max(value[0], value[1] - amount)]),
              ArrowDown: () => onChange([value[0], Math.max(value[0], value[1] - amount)]),
              ArrowRight: () => onChange([value[0], Math.min(max, value[1] + amount)]),
              ArrowUp: () => onChange([value[0], Math.min(max, value[1] + amount)]),
              End: () => onChange([value[0], max]),
            };
            const keyAction = keyMap[e.key];
            if (!keyAction) return;
            e.preventDefault();
            keyAction();
          }}
        />
      </div>
      <span className="inline-flex w-18 max-w-18 min-w-18 items-center justify-end gap-0.5 text-right text-xs tabular-nums">
        {value[0]}
        {suffix} - {value[1]}
        {suffix}
      </span>
    </div>
  );
}
