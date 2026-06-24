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
