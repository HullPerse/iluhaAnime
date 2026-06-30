import { useEffect, useRef, useState } from "react";
import { useMediaStore } from "@/store/media.store";

function SeekOffset({ mediaPath }: { mediaPath?: string }) {
  const subOffset = useMediaStore((state) =>
    mediaPath ? (state.getEntry(mediaPath)?.subOffset ?? 0) : 0,
  );
  const [visible, setVisible] = useState<boolean>(false);
  const timerRef = useRef<number | null>(null);
  const prevRef = useRef(subOffset);

  useEffect(() => {
    if (subOffset === prevRef.current) return;
    prevRef.current = subOffset;
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setVisible(false), 1500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [subOffset]);

  if (!visible || !mediaPath) return null;

  return (
    <div className="absolute top-1 right-1 p-1 windows95-border w-14 windows95-font text-center font-bold text-md">
      {subOffset > 0 ? "+" : ""}
      {subOffset}
    </div>
  );
}

export default SeekOffset;
