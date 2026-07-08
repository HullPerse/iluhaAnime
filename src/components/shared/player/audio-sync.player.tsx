import { useEffect, useRef } from "react";

const NUDGE_THRESHOLD = 0.1;
const NUDGE_RATE = 0.02;
const FORCE_SEEK_THRESHOLD = 0.5;

function AudioSync({
  videoEl,
  audioSrc,
  delay,
  volume,
  muted,
}: {
  videoEl: HTMLVideoElement | null;
  audioSrc: string | null;
  delay: number;
  volume: number;
  muted: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = muted;
  }, [muted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !videoEl) return;

    const onPlay = () => {
      const target = videoEl.currentTime - delay;
      audio.currentTime = Math.max(0, target);
      audio.play().catch((e: unknown) => {
        if (e instanceof DOMException && e.name !== "NotAllowedError") {
          console.warn("AudioSync play error:", e);
        }
      });
    };

    const onPause = () => {
      audio.pause();
    };

    const onSeeked = () => {
      const target = videoEl.currentTime - delay;
      audio.currentTime = Math.max(0, target);
    };

    videoEl.addEventListener("play", onPlay);
    videoEl.addEventListener("pause", onPause);
    videoEl.addEventListener("seeked", onSeeked);

    let rafId: number;
    const loop = () => {
      if (!audio.paused && !videoEl.paused) {
        const target = videoEl.currentTime - delay;
        const drift = audio.currentTime - target;

        if (Math.abs(drift) > FORCE_SEEK_THRESHOLD) {
          audio.currentTime = target;
          audio.playbackRate = videoEl.playbackRate;
        } else if (Math.abs(drift) > NUDGE_THRESHOLD) {
          const dir = drift < 0 ? 1 : -1;
          audio.playbackRate = videoEl.playbackRate * (1 + dir * NUDGE_RATE);
        } else {
          audio.playbackRate = videoEl.playbackRate;
        }
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    return () => {
      videoEl.removeEventListener("play", onPlay);
      videoEl.removeEventListener("pause", onPause);
      videoEl.removeEventListener("seeked", onSeeked);
      cancelAnimationFrame(rafId);
    };
  }, [videoEl, delay]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audioSrc) {
      audio.src = audioSrc;
      audio.load();
      if (videoEl && !videoEl.paused) {
        const target = videoEl.currentTime - delay;
        audio.currentTime = Math.max(0, target);
        audio.play().catch((e: unknown) => {
          if (e instanceof DOMException && e.name !== "NotAllowedError") {
            console.warn("AudioSync src-switch play error:", e);
          }
        });
      }
    } else {
      audio.pause();
      audio.src = "";
    }
  }, [audioSrc, videoEl, delay]);

  // Notify parent when browser can't play the audio track
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioSrc) return;

    const onError = () => {
      const err = audio.error;
      if (err && err.code !== MediaError.MEDIA_ERR_ABORTED) {
        window.dispatchEvent(
          new CustomEvent("audio-track-failed", { detail: { src: audioSrc } }),
        );
      }
    };

    audio.addEventListener("error", onError);
    return () => audio.removeEventListener("error", onError);
  }, [audioSrc]);

  return <audio ref={audioRef} style={{ display: "none" }} preload="auto" />;
}

export default AudioSync;
