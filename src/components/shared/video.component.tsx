import { useCallback, useEffect, useRef, useState } from "react";

import { selectBuffer, selectTime, selectVolume } from "@videojs/core/dom";
import type { TextTrackListLike, TextTrackLike } from "@videojs/media";
import {
  Container,
  MuteButton,
  PlayButton,
  Time,
  createPlayer,
  useMedia,
  useMediaAttach,
  usePlayer,
} from "@videojs/react";
import { YouTubeVideo } from "@videojs/react/media/youtube-video";
import { videoFeatures } from "@videojs/react/video";
import { ExternalLink, Maximize, Minimize, Pause, Play, Volume, Volume1, Volume2, VolumeX } from "lucide-react";

import Select from "@/components/ui/select.component";
import { cn } from "cn";
import { useI18n } from "@/lib/locale/i18n.utils";
import { openUrl } from "@tauri-apps/plugin-opener";

const { Player: VideoPlayerProvider } = createPlayer({
  features: videoFeatures,
  displayName: "VideoPlayer",
});

const DEFAULT_VOLUME = 0.05;
const VOLUME_STEP = 0.05;
const CAPTIONS_OFF = "off";

// Mirrors the library's own media/video.tsx: a native <video> registered as the
// player's media on mount (the element satisfies the Media interface).
function NativeVideo({ src, title }: { src: string; title?: string }) {
  const setMedia = useMediaAttach();
  const ref = useCallback(
    (el: HTMLVideoElement | null) => {
      if (!el || typeof el.addEventListener !== "function") return;
      setMedia?.(el);
    },
    [setMedia]
  );
  return <video src={src} title={title} ref={ref} className="h-full w-full" />;
}

function formatTime(seconds: number): string {
  if (seconds < 0 || !Number.isFinite(seconds)) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}


function useCaptionTracks() {
  const media = useMedia();
  const [tracks, setTracks] = useState<TextTrackLike[]>([]);
  const [showingId, setShowingId] = useState<string | null>(null);

  useEffect(() => {
    if (!media) return;
    const list = (media as { textTracks?: TextTrackListLike }).textTracks;
    if (!list) return;
    const sync = () => {
      const subs = Array.from(list).filter((track) => track.kind === "subtitles" || track.kind === "captions");
      setTracks((prev) => {
        if (
          prev.length === subs.length &&
          prev.every((track, i) => track === subs[i] && track.mode === subs[i].mode)
        ) {
          return prev;
        }
        return [...subs];
      });
      setShowingId(subs.find((track) => track.mode === "showing")?.id ?? null);
    };
    sync();
    const onListEvent = () => sync();
    // jsdom (and some shells) expose a bare array without EventTarget methods.
    list.addEventListener?.("addtrack", onListEvent);
    list.addEventListener?.("removetrack", onListEvent);
    list.addEventListener?.("change", onListEvent);
    // Tracklists can land after ready (YouTube syncs them on first play); poll briefly.
    const retry = window.setTimeout(sync, 250);
    return () => {
      list.removeEventListener?.("addtrack", onListEvent);
      list.removeEventListener?.("removetrack", onListEvent);
      list.removeEventListener?.("change", onListEvent);
      window.clearTimeout(retry);
    };
  }, [media]);

  return { tracks, showingId };
}

function CaptionsSelect() {
  const { t } = useI18n();
  const { tracks, showingId } = useCaptionTracks();
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    setSelected(showingId);
  }, [showingId]);
  if (tracks.length === 0) return null;

  const trackValue = (track: TextTrackLike) => track.id || track.language;
  const options: { value: string; label: string }[] = [
    { value: CAPTIONS_OFF, label: t("player.video.captions.off") },
    ...tracks.map((track) => ({
      value: trackValue(track),
      label: track.label || track.language.toUpperCase(),
    })),
  ];
  const current =
    selected && options.some((option) => option.value === selected) ? selected : CAPTIONS_OFF;

  const select = (value: string) => {
    for (const track of tracks) {
      track.mode = trackValue(track) === value && value !== CAPTIONS_OFF ? "showing" : "disabled";
    }
    setSelected(value);
  };

  return (
    <Select
      label={t("player.video.captions")}
      value={current}
      onChange={select}
      options={options}
      className="h-4 min-h-4 w-16"
    />
  );
}

function Win95PlayerButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "windows95-active-border bg-primary text-text flex size-6 shrink-0 cursor-pointer items-center justify-center hover:brightness-110 active:translate-x-px active:translate-y-px",
        className
      )}
    />
  );
}

function ScrubBar() {
  const time = usePlayer(selectTime);
  const buffer = usePlayer(selectBuffer);
  const barRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);
  const duration = time?.duration ?? 0;
  const display = scrubTime ?? time?.currentTime ?? 0;
  const progress = duration > 0 ? (display / duration) * 100 : 0;
  const buffered = buffer?.buffered ?? [];
  const bufferedEnd =
    buffered.length > 0 && duration > 0
      ? Math.min(100, ((buffered.at(-1)?.[1] ?? 0) / duration) * 100)
      : 0;

  const seekToTime = useCallback(
    (target: number) => {
      if (duration <= 0) return;
      const clamped = Math.max(0, Math.min(duration, target));
      setScrubTime(clamped);
      time?.seek(clamped);
    },
    [time, duration]
  );

  const seekAt = useCallback(
    (clientX: number) => {
      const rect = barRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      seekToTime(((clientX - rect.left) / rect.width) * duration);
    },
    [seekToTime, duration]
  );

  const timeAt = useCallback(
    (clientX: number) => {
      const rect = barRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return null;
      const t = ((clientX - rect.left) / rect.width) * duration;
      return Math.max(0, Math.min(duration, t));
    },
    [duration]
  );

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (event: MouseEvent) => seekAt(event.clientX);
    const handleUp = () => setDragging(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging, seekAt]);

  return (
    <div
      ref={barRef}
      className="windows95-border relative h-4 min-w-0 flex-1 cursor-pointer bg-white"
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuenow={Math.round(display)}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      onMouseDown={(event) => {
        event.preventDefault();
        setDragging(true);
        seekAt(event.clientX);
      }}
      onMouseMove={(event) => {
        const t = timeAt(event.clientX);
        setHoverTime(t);
        const rect = barRef.current?.getBoundingClientRect();
        if (rect) setHoverX(event.clientX - rect.left);
      }}
      onMouseLeave={() => setHoverTime(null)}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") seekToTime(display + 5);
        if (event.key === "ArrowLeft") seekToTime(display - 5);
      }}
    >
      {hoverTime !== null && duration > 0 && (
        <div
          className="windows95-border bg-primary pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap px-1 py-0.5 windows95-text"
          style={{ left: `${hoverX}px`, transform: "translateX(-50%)" }}
        >
          {formatTime(hoverTime)}
        </div>
      )}
      <div className="bg-muted/30 absolute inset-y-0 left-0" style={{ width: `${bufferedEnd}%` }} />
      <div
        className="bg-highlight absolute inset-y-0 left-0 transition-none"
        style={{ width: `${progress}%` }}
      />
      <div
        className="windows95-active-border bg-primary pointer-events-none absolute top-0 bottom-0 w-2"
        style={{ left: `${progress}%`, transform: "translateX(-50%)" }}
      />
    </div>
  );
}

function VolumeBar() {
  const volume = usePlayer(selectVolume);
  const barRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hovering, setHovering] = useState(false);
  const level = volume?.muted ? 0 : (volume?.volume ?? 1);
  const percent = Math.round(level * 100);

  const setAt = useCallback(
    (clientX: number) => {
      const rect = barRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      volume?.setVolume(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)));
    },
    [volume]
  );

  const step = useCallback(
    (delta: number) => {
      if (!volume) return;
      volume.setVolume(Math.max(0, Math.min(1, (volume.volume ?? 1) + delta)));
    },
    [volume]
  );

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (event: MouseEvent) => setAt(event.clientX);
    const handleUp = () => setDragging(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging, setAt]);

  return (
    <div
      ref={barRef}
      className="windows95-border relative h-4 w-20 shrink-0 cursor-pointer bg-white"
      role="slider"
      tabIndex={0}
      aria-label="Volume"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      onMouseDown={(event) => {
        event.preventDefault();
        setDragging(true);
        setAt(event.clientX);
      }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onWheel={(event) => {
        event.preventDefault();
        step(event.deltaY < 0 ? VOLUME_STEP : -VOLUME_STEP);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowUp") step(VOLUME_STEP);
        if (event.key === "ArrowLeft" || event.key === "ArrowDown") step(-VOLUME_STEP);
      }}
    >
      {(hovering || dragging) && (
        <div className="windows95-border bg-primary pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap px-1 py-0.5 windows95-text">
          {percent}%
        </div>
      )}
      <div
        className="bg-highlight absolute inset-y-0 left-0 transition-none"
        style={{ width: `${level * 100}%` }}
      />
      <div
        className="windows95-active-border bg-primary pointer-events-none absolute top-0 bottom-0 w-2"
        style={{ left: `${level * 100}%`, transform: "translateX(-50%)" }}
      />
    </div>
  );
}

function VolumeGlyph() {
  const volume = usePlayer(selectVolume);
  const level = volume?.muted ? 0 : (volume?.volume ?? 1);
  if (level === 0) return <VolumeX className="size-3" />;
  if (level < 0.34) return <Volume className="size-3" />;
  if (level < 0.67) return <Volume1 className="size-3" />;
  return <Volume2 className="size-3" />;
}

function VolumeInitializer() {
  const media = useMedia();
  const applied = useRef(false);
  useEffect(() => {
    if (!media || applied.current) return;
    applied.current = true;
    (media as { volume?: number }).volume = DEFAULT_VOLUME;
  }, [media]);
  return null;
}

function FullscreenToggle({ iframeRef }: { iframeRef: React.RefObject<HTMLIFrameElement | null> }) {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === iframeRef.current);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, [iframeRef]);

  const toggle = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    if (fullscreen) {
      document.exitFullscreen?.()?.catch(() => {});
    } else {
      iframe.requestFullscreen?.()?.catch(() => {});
    }
  };

  return (
    <Win95PlayerButton
      onClick={toggle}
      aria-label="Fullscreen"
      title="Fullscreen"
    >
      {fullscreen ? <Minimize className="size-3" /> : <Maximize className="size-3" />}
    </Win95PlayerButton>
  );
}

function OpenInBrowserButton({ youtubeId }: { youtubeId: string }) {
  const { t } = useI18n();
  const onClick = () => {
    try {
      // openUrl is mocked as undefined in tests: wrap so both promise and void shapes are safe.
      Promise.resolve(openUrl(`https://www.youtube.com/watch?v=${youtubeId}`)).catch(
        () => undefined
      );
    } catch {
      // no-op
    }
  };
  return (
    <Win95PlayerButton onClick={onClick} aria-label={t("player.video.open.browser")} title={t("player.video.open.browser")}>
      <ExternalLink className="size-3" />
    </Win95PlayerButton>
  );
}

export interface VideoPlayerProps {
  youtubeId?: string | null;
  webmUrl?: string | null;
  title: string;
  className?: string;
}

export function VideoPlayer({ youtubeId, webmUrl, title, className }: VideoPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const isYoutube = !webmUrl && !!youtubeId;

  if (!isYoutube && !webmUrl) return null;

  return (
    <VideoPlayerProvider>
      <Container
        className={cn("flex w-full flex-col gap-1", className)}
      >
        <VolumeInitializer />
        <div className="aspect-video w-full overflow-hidden bg-black">
          {webmUrl ? (
            <NativeVideo src={webmUrl} title={title} />
          ) : (
            <YouTubeVideo
              ref={iframeRef}
              src={`https://www.youtube-nocookie.com/embed/${youtubeId}`}
            />
          )}
        </div>
        <div className="flex flex-row items-center gap-1" role="toolbar" aria-label={title}>
          <PlayButton
            render={(props, state) => (
              <Win95PlayerButton {...props}>
                {state.paused ? <Play className="size-3" /> : <Pause className="size-3" />}
              </Win95PlayerButton>
            )}
          />
          <Time.Group className="windows95-text shrink-0 text-xs tabular-nums">
            <Time.Value type="current" />
            <Time.Separator> / </Time.Separator>
            <Time.Value type="duration" />
          </Time.Group>
          <ScrubBar />
          <MuteButton
            render={(props) => (
              <Win95PlayerButton {...props}>
                <VolumeGlyph />
              </Win95PlayerButton>
            )}
          />
          <VolumeBar />
          {isYoutube ? (
            <>
              <CaptionsSelect />
              <OpenInBrowserButton youtubeId={youtubeId ?? ""} />
            </>
          ) : null}
          <FullscreenToggle iframeRef={iframeRef} />
        </div>
      </Container>
    </VideoPlayerProvider>
  );
}
