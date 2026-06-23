import {
  selectPlayback,
  selectTime,
  selectVolume,
  usePlayer,
} from "@videojs/react";
import { useEffect } from "react";

const FRAME_STEP = 1 / 30;

function Keyboard({
  mediaPath,
  onFileNext,
  onFilePrev,
  hasNext,
  hasPrev,
  onToggleAutoHide,
}: {
  mediaPath?: string;
  onFileNext?: () => void;
  onFilePrev?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
  onToggleAutoHide?: () => void;
}) {
  const playback = usePlayer(selectPlayback);
  const time = usePlayer(selectTime);
  const volume = usePlayer(selectVolume);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.code) {
        case "Space": {
          e.preventDefault();
          if (playback?.paused) playback?.play();
          else playback?.pause();
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          const ct = time?.currentTime ?? 0;
          const dur = time?.duration ?? 0;
          time?.seek?.(Math.min(ct + 5, dur));
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          const ct = time?.currentTime ?? 0;
          time?.seek?.(Math.max(ct - 5, 0));
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const v = volume?.volume ?? 0;
          volume?.setVolume?.(Math.min(v + 0.01, 1));
          break;
        }
        case "ArrowDown": {
          e.preventDefault();
          const v = volume?.volume ?? 0;
          volume?.setVolume?.(Math.max(v - 0.01, 0));
          break;
        }
        case "Comma": {
          e.preventDefault();
          playback?.pause();
          const ct = time?.currentTime ?? 0;
          time?.seek?.(Math.max(ct - FRAME_STEP, 0));
          break;
        }
        case "Period": {
          e.preventDefault();
          playback?.pause();
          const ct = time?.currentTime ?? 0;
          const dur = time?.duration ?? 0;
          time?.seek?.(Math.min(ct + FRAME_STEP, dur));
          break;
        }
        case "F1": {
          e.preventDefault();
          if (!mediaPath) break;
          const delta = e.ctrlKey ? -0.05 : -0.5;
          const current = parseFloat(localStorage.getItem(`sub_offset:${mediaPath}`) ?? "0");
          const next = Math.max(-300, current + delta);
          localStorage.setItem(`sub_offset:${mediaPath}`, String(next));
          window.dispatchEvent(new CustomEvent("suboffsetchange", { detail: { path: mediaPath, offset: next } }));
          break;
        }
        case "F2": {
          e.preventDefault();
          if (!mediaPath) break;
          const delta = e.ctrlKey ? 0.05 : 0.5;
          const current = parseFloat(localStorage.getItem(`sub_offset:${mediaPath}`) ?? "0");
          const next = Math.min(300, current + delta);
          localStorage.setItem(`sub_offset:${mediaPath}`, String(next));
          window.dispatchEvent(new CustomEvent("suboffsetchange", { detail: { path: mediaPath, offset: next } }));
          break;
        }
        case "KeyH": {
          if (!e.ctrlKey) break;
          e.preventDefault();
          onToggleAutoHide?.();
          break;
        }
        case "PageDown": {
          e.preventDefault();
          onFileNext?.();
          break;
        }
        case "PageUp": {
          e.preventDefault();
          onFilePrev?.();
          break;
        }
      }
    };

    const handleWheel = (e: WheelEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      e.preventDefault();
      const v = volume?.volume ?? 0;
      if (e.deltaY < 0) volume?.setVolume?.(Math.min(v + 0.01, 1));
      else volume?.setVolume?.(Math.max(v - 0.01, 0));
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("wheel", handleWheel);
    };
  }, [playback, time, volume, mediaPath, onFileNext, onFilePrev, hasNext, hasPrev, onToggleAutoHide]);

  return null;
}
export default Keyboard;
