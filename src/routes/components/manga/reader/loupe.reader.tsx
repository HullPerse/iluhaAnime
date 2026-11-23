import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useCell } from "@hullperse/hp_utils/react";
import { patchSettings, settingsAtoms } from "@/store/settings.store";

type LoupePoint = { x: number; y: number; frame: number };

function insideImage(image: HTMLImageElement, point: { x: number; y: number }): boolean {
  const rect = image.getBoundingClientRect();

  return (
    point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
  );
}

export function ReaderLoupe({ image }: { image: HTMLImageElement | null }) {
  const size = useCell(settingsAtoms.mangaLoupeSize);
  const zoom = useCell(settingsAtoms.mangaLoupeZoom);
  const [point, setPoint] = useState<LoupePoint | null>(null);
  useEffect(() => {
    if (!image) return;
    let last: { x: number; y: number } | null = null;
    const move = (event: PointerEvent) => {
      if (event.target !== image) {
        last = null;
        setPoint(null);

        return;
      }

      const rect = image.getBoundingClientRect();
      last =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
          ? { x: event.clientX, y: event.clientY }
          : null;
      setPoint(event.altKey && last ? { ...last, frame: 0 } : null);
    };

    const key = (event: KeyboardEvent) => {
      if (event.key !== "Alt") return;

      if (last && !insideImage(image, last)) last = null;

      if (last) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }

      setPoint(event.type === "keydown" && last ? { ...last, frame: 0 } : null);
    };

    const clear = () => {
      last = null;
      setPoint(null);
    };

    const follow = () => {
      setPoint((current) => {
        if (!current) return current;

        if (!insideImage(image, current)) return null;

        return { ...current, frame: current.frame + 1 };
      });
    };

    const wheel = (event: WheelEvent) => {
      if (!event.altKey || !last) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      patchSettings({
        mangaLoupeZoom: Math.max(
          1.5,
          Math.min(5, settingsAtoms.mangaLoupeZoom.get() + (event.deltaY < 0 ? 0.5 : -0.5))
        ),
      });
    };

    window.addEventListener("pointermove", move, true);
    window.addEventListener("keydown", key, true);
    window.addEventListener("keyup", key, true);
    window.addEventListener("blur", clear);
    window.addEventListener("resize", follow);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("contextmenu", clear, true);
    image.addEventListener("pointerleave", clear);
    image.addEventListener("wheel", wheel, { passive: false });

    return () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("keyup", key, true);
      window.removeEventListener("blur", clear);
      window.removeEventListener("resize", follow);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("contextmenu", clear, true);
      image.removeEventListener("pointerleave", clear);
      image.removeEventListener("wheel", wheel);
    };
  }, [image]);

  if (!image || !point) return null;
  const rect = image.getBoundingClientRect();
  const diameter = Math.min(size, window.innerWidth, window.innerHeight);
  const left = Math.max(0, Math.min(window.innerWidth - diameter, point.x - diameter / 2));
  const top = Math.max(0, Math.min(window.innerHeight - diameter, point.y - diameter / 2));
  const host = image.closest("dialog") ?? document.body;

  return createPortal(
    <span
      aria-hidden
      data-reader-loupe
      className="pointer-events-none fixed z-40 rounded-full border-2 border-white shadow-lg"
      style={{
        left,
        top,
        width: diameter,
        height: diameter,
        backgroundImage: `url("${image.src}")`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${rect.width * zoom}px ${rect.height * zoom}px`,
        backgroundPosition: `${diameter / 2 - (point.x - rect.left) * zoom}px ${diameter / 2 - (point.y - rect.top) * zoom}px`,
      }}
    />,
    host
  );
}
