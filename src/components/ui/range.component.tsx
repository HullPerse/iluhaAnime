import { useCallback, useEffect, useRef, useState } from "react";

import { useI18n } from "@/lib/i18n";

function Slider({
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
  suffix?: string;
  onChange: (v: number) => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const pct = (value - min) / (max - min);

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
      {label && <span className="w-24 shrink-0">{label}</span>}
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label={label ?? t("common.slider")}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${value}${suffix ?? ""}`}
        className="windows95-border relative h-4 flex-1 cursor-pointer bg-white"
        onKeyDown={(e) => {
          const amount = e.shiftKey ? step * 10 : step;
          if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            e.preventDefault();
            onChange(Math.max(min, value - amount));
          } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            e.preventDefault();
            onChange(Math.min(max, value + amount));
          } else if (e.key === "Home") {
            e.preventDefault();
            onChange(min);
          } else if (e.key === "End") {
            e.preventDefault();
            onChange(max);
          }
        }}
        onMouseDown={(e) => {
          e.preventDefault();
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
      <span className="w-10 text-right tabular-nums">
        {value}
        {suffix}
      </span>
    </div>
  );
}
export default Slider;

function DualSlider({
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
  suffix?: string;
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
    <div
      className="flex items-center gap-1 select-none"
      role="group"
      aria-label={sliderLabel}
    >
      {label && <span className="w-24 shrink-0 text-[10px]">{label}</span>}
      <div
        ref={ref}
        className="windows95-border relative h-4 flex-1 cursor-pointer bg-white"
        onMouseDown={(e) => {
          e.preventDefault();
          const rect = ref.current!.getBoundingClientRect();
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
          aria-valuetext={`${value[0]}${suffix ?? ""}`}
          className="bg-primary windows95-active-border absolute top-0 bottom-0 w-3 cursor-pointer"
          style={{ left: `${low}%`, transform: "translateX(-50%)" }}
          onMouseDown={(e) => {
            e.stopPropagation();
            setDragTarget("min");
          }}
          onKeyDown={(e) => {
            const amount = e.shiftKey ? step * 10 : step;
            if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
              e.preventDefault();
              onChange([Math.max(min, value[0] - amount), value[1]]);
            } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
              e.preventDefault();
              onChange([Math.min(value[1], value[0] + amount), value[1]]);
            } else if (e.key === "Home") {
              e.preventDefault();
              onChange([min, value[1]]);
            }
          }}
        />
        <button
          type="button"
          role="slider"
          aria-label={`${sliderLabel} ${t("common.maximum")}`}
          aria-valuemin={value[0]}
          aria-valuemax={max}
          aria-valuenow={value[1]}
          aria-valuetext={`${value[1]}${suffix ?? ""}`}
          className="bg-primary windows95-active-border absolute top-0 bottom-0 w-3 cursor-pointer"
          style={{ left: `${high}%`, transform: "translateX(-50%)" }}
          onMouseDown={(e) => {
            e.stopPropagation();
            setDragTarget("max");
          }}
          onKeyDown={(e) => {
            const amount = e.shiftKey ? step * 10 : step;
            if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
              e.preventDefault();
              onChange([value[0], Math.max(value[0], value[1] - amount)]);
            } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
              e.preventDefault();
              onChange([value[0], Math.min(max, value[1] + amount)]);
            } else if (e.key === "End") {
              e.preventDefault();
              onChange([value[0], max]);
            }
          }}
        />
      </div>
      <span className="w-18 max-w-18 min-w-18 text-right text-[10px] tabular-nums">
        {value[0]}
        {suffix} - {value[1]}
        {suffix}
      </span>
    </div>
  );
}

export { DualSlider };
