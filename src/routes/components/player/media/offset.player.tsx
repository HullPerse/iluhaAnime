import { useEffect, useRef, useState } from "react";

import { useI18n } from "@/hooks/i18n.hook";
import { useMediaStore } from "@/store/media.store";
import { usePlaybackStore, usePlayerStore } from "@/store/player.store";

import { trackLabel } from "./tracks.player";

const OSD_TIMEOUT = 2500;

function OsdOverlay() {
  const { t } = useI18n();

  const path = usePlaybackStore((state) => state.path);
  const speed = usePlaybackStore((state) => state.speed);
  const muted = usePlaybackStore((state) => state.muted);
  const tracks = usePlaybackStore((state) => state.tracks);
  const volume = usePlayerStore((state) => state.volume);

  const subOffset = useMediaStore((state) =>
    path ? (state.getEntry(path)?.subOffset ?? 0) : 0,
  );
  const audioOffset = useMediaStore((state) =>
    path ? (state.getEntry(path)?.audioOffset ?? 0) : 0,
  );

  const audioTrack = tracks.find((track) => track.type === "audio" && track.selected);
  const subTrack = tracks.find((track) => track.type === "sub" && track.selected);

  const [visible, setVisible] = useState(false);
  const timerRef = useRef<number | null>(null);
  const previousRef = useRef({
    audio: undefined as number | undefined,
    sub: undefined as number | undefined,
    subOffset: 0,
    audioOffset: 0,
    speed: 1,
    volume: 0,
    muted: false,
  });

  useEffect(() => {
    const previous = previousRef.current;
    const changed =
      audioTrack?.id !== previous.audio ||
      subTrack?.id !== previous.sub ||
      subOffset !== previous.subOffset ||
      audioOffset !== previous.audioOffset ||
      speed !== previous.speed ||
      volume !== previous.volume ||
      muted !== previous.muted;

    if (!changed) return;

    previousRef.current = {
      audio: audioTrack?.id,
      sub: subTrack?.id,
      subOffset,
      audioOffset,
      speed,
      volume,
      muted,
    };

    setVisible(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setVisible(false), OSD_TIMEOUT);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [audioTrack?.id, subTrack?.id, subOffset, audioOffset, speed, volume, muted]);

  if (!visible || !path) return null;

  const signed = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(2)}s`;

  return (
    <div className="absolute top-4 right-4 z-20 p-2 windows95-border min-w-48 windows95-font text-sm bg-primary/95 text-left">
      {audioTrack ? (
        <div className="mb-0.5">
          <span className="text-muted text-xs">{t("player.media.osd.audio")}:</span>{" "}
          <span className="font-bold">{trackLabel(audioTrack)}</span>
        </div>
      ) : null}
      {subTrack ? (
        <div className="mb-0.5">
          <span className="text-muted text-xs">{t("player.media.osd.subtitles")}:</span>{" "}
          <span className="font-bold">{trackLabel(subTrack)}</span>
        </div>
      ) : null}
      {audioOffset !== 0 ? (
        <div className="mb-0.5">
          <span className="text-muted text-xs">{t("player.media.osd.audio.delay")}:</span>{" "}
          <span className="font-bold">{signed(audioOffset)}</span>
        </div>
      ) : null}
      {subOffset !== 0 ? (
        <div className="mb-0.5">
          <span className="text-muted text-xs">{t("player.media.osd.sub.delay")}:</span>{" "}
          <span className="font-bold">{signed(subOffset)}</span>
        </div>
      ) : null}
      {speed !== 1 ? (
        <div className="mb-0.5">
          <span className="text-muted text-xs">{t("player.media.osd.speed")}:</span>{" "}
          <span className="font-bold">{speed}x</span>
        </div>
      ) : null}
      <div>
        <span className="text-muted text-xs">{t("player.media.osd.volume")}:</span>{" "}
        <span className="font-bold">
          {muted ? "MUTE" : `${Math.round(volume * 100)}%`}
        </span>
      </div>
    </div>
  );
}

export default OsdOverlay;