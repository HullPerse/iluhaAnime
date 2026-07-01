import { useCallback, useEffect, useRef, useState } from "react";

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
    [min, max, step, onChange],
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
        className="flex-1 h-4 windows95-border bg-white relative cursor-pointer"
        onMouseDown={(e) => {
          e.preventDefault();
          setDragging(true);
          setFromClientX(e.clientX);
        }}
      >
        <div
          className="absolute inset-y-0 left-0 bg-highlight"
          style={{ width: `${pct * 100}%` }}
        />
        <div
          className="absolute top-0 bottom-0 w-2 bg-primary windows95-active-border pointer-events-none"
          style={{ left: `${pct * 100}%`, transform: "translateX(-50%)" }}
        />
      </div>
      <span className="w-10 tabular-nums text-right">
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
    [min, max, step, value, onChange],
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
    <div className="flex items-center gap-1 select-none">
      {label && <span className="w-24 shrink-0 text-[10px]">{label}</span>}
      <div
        ref={ref}
        className="flex-1 h-4 windows95-border bg-white relative cursor-pointer"
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
          className="absolute inset-y-0 bg-highlight"
          style={{ left: `${low}%`, right: `${100 - high}%` }}
        />
        <div
          className="absolute top-0 bottom-0 w-2 bg-primary windows95-active-border pointer-events-none cursor-pointer"
          style={{ left: `${low}%`, transform: "translateX(-50%)" }}
        />
        <div
          className="absolute top-0 bottom-0 w-2 bg-primary windows95-active-border pointer-events-none cursor-pointer"
          style={{ left: `${high}%`, transform: "translateX(-50%)" }}
        />
      </div>
      <span className="w-16 tabular-nums text-right text-[10px]">
        {value[0]}
        {suffix} — {value[1]}
        {suffix}
      </span>
    </div>
  );
}

export { DualSlider };
