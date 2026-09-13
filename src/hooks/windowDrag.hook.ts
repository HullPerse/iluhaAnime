import { useEffect, useState } from "react";

export function useWindowDrag(onMove: (clientX: number) => void) {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (event: MouseEvent) => onMove(event.clientX);
    const handleUp = () => setDragging(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging, onMove]);

  return { dragging, setDragging };
}
