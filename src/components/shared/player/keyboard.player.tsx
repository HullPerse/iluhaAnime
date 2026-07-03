import {
  selectPlayback,
  selectTime,
  selectVolume,
  usePlayer,
} from "@videojs/react";
import { useEffect } from "react";
import { getAction } from "@/config/keybinds.config";
import { useMediaStore } from "@/store/media.store";

const FRAME_STEP = 1 / 30;

function Keyboard({
  mediaPath,
  onFileNext,
  onFilePrev,
  onToggleAutoHide,
  onRequestJumpToTime,
}: {
  mediaPath?: string;
  onFileNext?: () => void;
  onFilePrev?: () => void;
  onToggleAutoHide?: () => void;
  onRequestJumpToTime?: () => void;
}) {
  const playback = usePlayer(selectPlayback);
  const time = usePlayer(selectTime);
  const volume = usePlayer(selectVolume);
  const mediaGet = useMediaStore((s) => s.getEntry);
  const mediaSetSub = useMediaStore((s) => s.setSubOffset);
  const mediaSetAudio = useMediaStore((s) => s.setAudioOffset);

  function shouldIgnoreGlobalHotkeys(target: EventTarget | null) {
    const el = target instanceof HTMLElement ? target : null;
    if (!el) return false;

    return Boolean(
      el.closest(
        'input, textarea, select, button, [contenteditable="true"], [data-no-hotkeys], [data-hotkeys-disabled], [data-no-wheel]',
      ),
    );
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreGlobalHotkeys(e.target)) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const action = getAction(e.code, e.ctrlKey, e.shiftKey, e.altKey);
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
          const delta =
            action.action === "subtitleOffsetDownFine" ? -0.05 : -0.5;
          const current = mediaGet(mediaPath)?.subOffset ?? 0;
          const next = Math.max(-300, current + delta);
          mediaSetSub(mediaPath, Math.round(next * 100) / 100);
          window.dispatchEvent(
            new CustomEvent("suboffsetchange", {
              detail: { path: mediaPath, offset: next },
            }),
          );
          break;
        }
        case "subtitleOffsetUp":
        case "subtitleOffsetUpFine": {
          if (!mediaPath) break;
          const delta = action.action === "subtitleOffsetUpFine" ? 0.05 : 0.5;
          const current = mediaGet(mediaPath)?.subOffset ?? 0;
          const next = Math.min(300, current + delta);
          mediaSetSub(mediaPath, Math.round(next * 100) / 100);
          window.dispatchEvent(
            new CustomEvent("suboffsetchange", {
              detail: { path: mediaPath, offset: next },
            }),
          );
          break;
        }
        case "audioOffsetDown":
        case "audioOffsetDownFine": {
          if (!mediaPath) break;
          const audioDelta =
            action.action === "audioOffsetDownFine" ? -0.05 : -0.5;
          const audioCurrent = mediaGet(mediaPath)?.audioOffset ?? 0;
          const audioNext = Math.max(-300, audioCurrent + audioDelta);
          mediaSetAudio(mediaPath, Math.round(audioNext * 100) / 100);
          window.dispatchEvent(
            new CustomEvent("audiooffsetchange", {
              detail: { path: mediaPath, offset: audioNext },
            }),
          );
          break;
        }
        case "audioOffsetUp":
        case "audioOffsetUpFine": {
          if (!mediaPath) break;
          const audioDelta2 =
            action.action === "audioOffsetUpFine" ? 0.05 : 0.5;
          const audioCurrent2 = mediaGet(mediaPath)?.audioOffset ?? 0;
          const audioNext2 = Math.min(300, audioCurrent2 + audioDelta2);
          mediaSetAudio(mediaPath, Math.round(audioNext2 * 100) / 100);
          window.dispatchEvent(
            new CustomEvent("audiooffsetchange", {
              detail: { path: mediaPath, offset: audioNext2 },
            }),
          );
          break;
        }
        case "jumpToTime": {
          onRequestJumpToTime?.();
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
      if (shouldIgnoreGlobalHotkeys(e.target)) return;

      const target = e.target as HTMLElement;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (target.closest("[data-no-wheel]")) return;

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
  }, [
    playback,
    time,
    volume,
    mediaPath,
    onFileNext,
    onFilePrev,
    onToggleAutoHide,
  ]);

  return null;
}
export default Keyboard;
