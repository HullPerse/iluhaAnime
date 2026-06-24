import {
  selectPlayback,
  selectTime,
  selectVolume,
  usePlayer,
} from "@videojs/react";
import { useEffect } from "react";
import { getAction } from "@/config/keybinds.config";

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

      const action = getAction(e.code, e.ctrlKey, e.shiftKey);
      if (!action) return;
      e.preventDefault();

      switch (action.action) {
        case "playPause": {
          if (playback?.paused) playback?.play();
          else playback?.pause();
          break;
        }
        case "seekForward": {
          const ct = time?.currentTime ?? 0;
          const dur = time?.duration ?? 0;
          time?.seek?.(Math.min(ct + 5, dur));
          break;
        }
        case "seekBackward": {
          const ct = time?.currentTime ?? 0;
          time?.seek?.(Math.max(ct - 5, 0));
          break;
        }
        case "volumeUp": {
          const v = volume?.volume ?? 0;
          volume?.setVolume?.(Math.min(v + 0.01, 1));
          break;
        }
        case "volumeDown": {
          const v = volume?.volume ?? 0;
          volume?.setVolume?.(Math.max(v - 0.01, 0));
          break;
        }
        case "frameBackward": {
          playback?.pause();
          const ct = time?.currentTime ?? 0;
          time?.seek?.(Math.max(ct - FRAME_STEP, 0));
          break;
        }
        case "frameForward": {
          playback?.pause();
          const ct = time?.currentTime ?? 0;
          const dur = time?.duration ?? 0;
          time?.seek?.(Math.min(ct + FRAME_STEP, dur));
          break;
        }
        case "subtitleOffsetDown":
        case "subtitleOffsetDownFine": {
          if (!mediaPath) break;
          const delta = action.action === "subtitleOffsetDownFine" ? -0.05 : -0.5;
          const current = parseFloat(localStorage.getItem(`sub_offset:${mediaPath}`) ?? "0");
          const next = Math.max(-300, current + delta);
          localStorage.setItem(`sub_offset:${mediaPath}`, String(next));
          window.dispatchEvent(new CustomEvent("suboffsetchange", { detail: { path: mediaPath, offset: next } }));
          break;
        }
        case "subtitleOffsetUp":
        case "subtitleOffsetUpFine": {
          if (!mediaPath) break;
          const delta = action.action === "subtitleOffsetUpFine" ? 0.05 : 0.5;
          const current = parseFloat(localStorage.getItem(`sub_offset:${mediaPath}`) ?? "0");
          const next = Math.min(300, current + delta);
          localStorage.setItem(`sub_offset:${mediaPath}`, String(next));
          window.dispatchEvent(new CustomEvent("suboffsetchange", { detail: { path: mediaPath, offset: next } }));
          break;
        }
        case "toggleAutoHide": {
          onToggleAutoHide?.();
          break;
        }
        case "nextFile": {
          onFileNext?.();
          break;
        }
        case "prevFile": {
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
