import { useEffect, useRef, useState } from "react";
import { useMediaStore } from "@/store/media.store";

function SeekOffset({ mediaPath }: { mediaPath?: string }) {
  const subOffset = useMediaStore((state) =>
    mediaPath ? (state.getEntry(mediaPath)?.subOffset ?? 0) : 0,
  );
  const audioOffset = useMediaStore((state) =>
    mediaPath ? (state.getEntry(mediaPath)?.audioOffset ?? 0) : 0,
  );
  const [visible, setVisible] = useState<boolean>(false);
  const timerRef = useRef<number | null>(null);
  const prevSubRef = useRef(subOffset);
  const prevAudioRef = useRef(audioOffset);

  useEffect(() => {
    if (subOffset === prevSubRef.current && audioOffset === prevAudioRef.current) return;
    prevSubRef.current = subOffset;
    prevAudioRef.current = audioOffset;
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setVisible(false), 1500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [subOffset, audioOffset]);

  if (!visible || !mediaPath) return null;

  return (
    <div className="absolute top-1 right-1 p-1 windows95-border w-fit min-w-20 min-h-10 windows95-font text-center font-bold text-md px-2 bg-primary">
      {subOffset !== 0 && <span className="mr-1">Суб: {subOffset > 0 ? "+" : ""}{subOffset}</span>}
      {audioOffset !== 0 && <span>Аудио: {audioOffset > 0 ? "+" : ""}{audioOffset}</span>}
    </div>
  );
}

export default SeekOffset;
