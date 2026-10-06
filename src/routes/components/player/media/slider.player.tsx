import { cn } from "cn";
import { useCallback, useEffect, useRef, useState } from "react";

function PlayerSlider({
  label,
  min,
  max,
  step,
  value,
  format,
  wheel,
  readoutClassName = "w-12",
  onChange,
}: {
  label?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (value: number) => string;
  wheel?: boolean;
  readoutClassName?: string;
  onChange: (value: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const clamped = Math.max(min, Math.min(max, value));
  const pct = max === min ? 0 : (clamped - min) / (max - min);

  const setFromClientX = useCallback(
    (clientX: number) => {
      const element = ref.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0) return;
      const raw = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const stepped = Math.round((min + raw * (max - min)) / step) * step;
      const bounded = Math.max(min, Math.min(max, stepped));
      onChange(Number(bounded.toFixed(6)));
    },
    [min, max, step, onChange]
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

  useEffect(() => {
    if (!wheel) return;
    const element = ref.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const amount = (event.shiftKey ? step * 10 : step) * (event.deltaY > 0 ? -1 : 1);
      onChange(Math.max(min, Math.min(max, clamped + amount)));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [wheel, min, max, step, clamped, onChange]);

  return (
    <div className="flex items-center gap-1 select-none">
      {label ? <span className="w-24 shrink-0 text-xs">{label}</span> : null}
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={clamped}
        aria-valuetext={format(clamped)}
        className="windows95-border bg-field relative h-4 flex-1 cursor-pointer"
        onKeyDown={(event) => {
          const amount = event.shiftKey ? step * 10 : step;
          const keyMap: Record<string, () => void> = {
            ArrowLeft: () => onChange(Math.max(min, clamped - amount)),
            ArrowDown: () => onChange(Math.max(min, clamped - amount)),
            ArrowRight: () => onChange(Math.min(max, clamped + amount)),
            ArrowUp: () => onChange(Math.min(max, clamped + amount)),
            Home: () => onChange(min),
            End: () => onChange(max),
          };
          const action = keyMap[event.key];
          if (!action) return;
          event.preventDefault();
          action();
        }}
        onMouseDown={(event) => {
          event.preventDefault();
          event.currentTarget.focus();
          setDragging(true);
          setFromClientX(event.clientX);
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
      <span
        className={cn(
          "inline-flex items-center justify-end text-right tabular-nums",
          readoutClassName
        )}
      >
        {format(clamped)}
      </span>
    </div>
  );
}

export default PlayerSlider;
