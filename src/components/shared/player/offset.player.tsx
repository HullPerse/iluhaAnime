import { useEffect, useRef, useState } from "react";
import { useMediaStore } from "@/store/media.store";
import type { VideoStreamInfo } from "@/types";
import { formatStreams } from "@/lib/player.utils";

function OsdOverlay({
  mediaPath,
  audioStream,
  subStream,
  playbackRate,
  volume,
  muted,
}: {
  mediaPath?: string;
  audioStream?: VideoStreamInfo;
  subStream?: VideoStreamInfo;
  playbackRate?: number;
  volume?: number;
  muted?: boolean;
}) {
  const subOffset = useMediaStore((state) =>
    mediaPath ? (state.getEntry(mediaPath)?.subOffset ?? 0) : 0,
  );
  const audioOffset = useMediaStore((state) =>
    mediaPath ? (state.getEntry(mediaPath)?.audioOffset ?? 0) : 0,
  );
  const [visible, setVisible] = useState<boolean>(false);
  const timerRef = useRef<number | null>(null);
  const prevRef = useRef<{
    audioIndex?: number;
    subIndex?: number;
    subOffset: number;
    audioOffset: number;
    playbackRate: number;
  }>({ subOffset: 0, audioOffset: 0, playbackRate: 1 });

  useEffect(() => {
    const prev = prevRef.current;
    const changed =
      audioStream?.index !== prev.audioIndex ||
      subStream?.index !== prev.subIndex ||
      subOffset !== prev.subOffset ||
      audioOffset !== prev.audioOffset ||
      (playbackRate ?? 1) !== prev.playbackRate;

    if (!changed) return;

    prevRef.current = {
      audioIndex: audioStream?.index,
      subIndex: subStream?.index,
      subOffset,
      audioOffset,
      playbackRate: playbackRate ?? 1,
    };

    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setVisible(false), 2500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [audioStream, subStream, subOffset, audioOffset, playbackRate]);

  if (!visible || !mediaPath) return null;

  return (
    <div className="absolute top-4 right-4 z-20 p-2 windows95-border min-w-48 windows95-font text-sm bg-primary/95 text-left">
      {audioStream && (
        <div className="mb-0.5">
          <span className="text-muted text-xs">Аудио:</span>{" "}
          <span className="font-bold">{formatStreams(audioStream)}</span>
        </div>
      )}
      {subStream && (
        <div className="mb-0.5">
          <span className="text-muted text-xs">Субтитры:</span>{" "}
          <span className="font-bold">{formatStreams(subStream)}</span>
        </div>
      )}
      {audioOffset !== 0 && (
        <div className="mb-0.5">
          <span className="text-muted text-xs">Задержка аудио:</span>{" "}
          <span className="font-bold">
            {audioOffset > 0 ? "+" : ""}
            {audioOffset.toFixed(2)}s
          </span>
        </div>
      )}
      {subOffset !== 0 && (
        <div className="mb-0.5">
          <span className="text-muted text-xs">Задержка субтитров:</span>{" "}
          <span className="font-bold">
            {subOffset > 0 ? "+" : ""}
            {subOffset.toFixed(2)}s
          </span>
        </div>
      )}
      {playbackRate !== undefined && playbackRate !== 1 && (
        <div className="mb-0.5">
          <span className="text-muted text-xs">Скорость:</span>{" "}
          <span className="font-bold">{playbackRate}x</span>
        </div>
      )}
      {volume !== undefined && (
        <div>
          <span className="text-muted text-xs">Громкость:</span>{" "}
          <span className="font-bold">
            {muted ? "MUTE" : `${Math.round(volume * 100)}%`}
          </span>
        </div>
      )}
    </div>
  );
}

export default OsdOverlay;
