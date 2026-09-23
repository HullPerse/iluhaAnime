import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";

import { useI18n } from "@/lib/locale/i18n.utils";
import { clamp, hsvToHex } from "@/lib/utils/color.utils";
import type { HSV } from "@/types/color";

export function SaturationValueArea({
  hsv,
  onChange,
}: {
  hsv: HSV;
  onChange: (next: { s: number; v: number }) => void;
}) {
  const { t } = useI18n();
  const areaRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const saturationPercent = Math.round(hsv.s);
  const valuePercent = Math.round(hsv.v);

  const setFromCoordinates = useCallback(
    (clientX: number, clientY: number) => {
      const rect = areaRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) return;
      const x = clamp(clientX - rect.left, 0, rect.width);
      const y = clamp(clientY - rect.top, 0, rect.height);
      onChange({
        s: Math.round((x / rect.width) * 100),
        v: Math.round((1 - y / rect.height) * 100),
      });
    },
    [onChange]
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: MouseEvent) => setFromCoordinates(event.clientX, event.clientY);
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, setFromCoordinates]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 1;
    const moves: Record<string, { s: number; v: number }> = {
      ArrowDown: { s: hsv.s, v: hsv.v - step },
      ArrowLeft: { s: hsv.s - step, v: hsv.v },
      ArrowRight: { s: hsv.s + step, v: hsv.v },
      ArrowUp: { s: hsv.s, v: hsv.v + step },
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    onChange({ s: clamp(Math.round(move.s), 0, 100), v: clamp(Math.round(move.v), 0, 100) });
  };

  return (
    <div
      ref={areaRef}
      role="slider"
      tabIndex={0}
      aria-label={t("color.area")}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={valuePercent}
      aria-valuetext={t("color.area.value", { saturation: saturationPercent, value: valuePercent })}
      className="windows95-border focus-visible:outline-text relative h-32 w-full cursor-crosshair touch-none overflow-hidden focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted"
      style={{ background: hsvToHex({ h: hsv.h, s: 100, v: 100 }) }}
      onMouseDown={(event) => {
        event.preventDefault();
        event.currentTarget.focus();
        setDragging(true);
        setFromCoordinates(event.clientX, event.clientY);
      }}
      onKeyDown={handleKeyDown}
    >
      <div className="pointer-events-none absolute inset-0 bg-linear-to-r from-white to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black to-transparent" />
      <div
        className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 border border-black shadow-[0_0_0_1px_white]"
        style={{ background: hsvToHex(hsv), left: `${hsv.s}%`, top: `${100 - hsv.v}%` }}
      />
    </div>
  );
}
