import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import type { VideoStreamInfo } from "@/types";
import { useState, useCallback, useRef, useEffect } from "react";
import { parseVTT } from "@/lib/utils";

function TrackSelect({
  label,
  tracks,
  selected,
  onChange,
}: {
  label: string;
  tracks: { index: number; label: string }[];
  selected: number;
  onChange: (index: number) => void;
}) {
  return (
    <select
      className="h-5 text-[10px] windows95-font bg-primary windows95-border px-1 min-w-20 max-w-28 outline-none focus-visible:outline-dotted focus-visible:outline-1 focus-visible:outline-offset-[-3px]"
      value={selected}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      <option value={-1}>{label}: выкл</option>
      {tracks.map((t) => (
        <option key={t.index} value={t.index}>
          {label}: {t.label}
        </option>
      ))}
    </select>
  );
}

function Tracks({
  audioStreams,
  subtitleStreams,
  mediaPath,
  videoEl,
  onAudioSwitch,
}: {
  audioStreams: VideoStreamInfo[];
  subtitleStreams: VideoStreamInfo[];
  mediaPath: string;
  videoEl: HTMLVideoElement | null;
  onAudioSwitch: (newSrc: string | null) => void;
}) {
  const defaultIdx = audioStreams.find((s) => s.is_default)?.index ?? -1;
  const [selectedAudio, setSelectedAudio] = useState(
    defaultIdx >= 0 ? defaultIdx : -1,
  );
  const [selectedSub, setSelectedSub] = useState(-1);
  const textTrackRef = useRef<TextTrack | null>(null);
  const pendingAudioRef = useRef(false);
  const savedTimeRef = useRef(0);
  const savedPlayingRef = useRef(false);

  const fmt = (s: VideoStreamInfo) => {
    const parts = [
      (s.language ?? "").toUpperCase(),
      s.codec_name,
      s.title ?? "",
    ].filter(Boolean);
    return parts.join(" - ") || `Track ${s.index}`;
  };

  const handleAudio = useCallback(
    async (idx: number) => {
      setSelectedAudio(idx);
      if (pendingAudioRef.current) return;

      if (videoEl) {
        savedTimeRef.current = videoEl.currentTime;
        savedPlayingRef.current = !videoEl.paused;
      }

      if (idx < 0 || !videoEl) {
        onAudioSwitch(null);
        return;
      }

      pendingAudioRef.current = true;
      try {
        const out = await invoke<string>("remux_video_audio", {
          path: mediaPath,
          streamIndex: idx,
        });
        onAudioSwitch(convertFileSrc(out));

        const restore = () => {
          pendingAudioRef.current = false;
          try {
            videoEl.currentTime = savedTimeRef.current;
          } catch {
            /* ignore */
          }
          if (savedPlayingRef.current) {
            videoEl.play().catch(() => {});
          }
          videoEl.removeEventListener("loadedmetadata", restore);
        };
        videoEl.addEventListener("loadedmetadata", restore, { once: true });
      } catch {
        pendingAudioRef.current = false;
        onAudioSwitch(null);
      }
    },
    [mediaPath, onAudioSwitch, videoEl],
  );

  const handleSub = useCallback(
    async (idx: number) => {
      setSelectedSub(idx);
      if (idx < 0 || !videoEl) {
        if (textTrackRef.current) {
          textTrackRef.current.mode = "disabled";
          textTrackRef.current = null;
        }
        return;
      }

      if (textTrackRef.current) {
        textTrackRef.current.mode = "disabled";
        textTrackRef.current = null;
      }

      try {
        const extracted = await invoke<string>("extract_video_subtitle", {
          path: mediaPath,
          streamIndex: idx,
        });
        const url = convertFileSrc(extracted);
        const resp = await fetch(url);
        const text = await resp.text();
        const cues = parseVTT(text);
        const stream = subtitleStreams.find((s) => s.index === idx)!;
        const lang = stream.language ?? "und";

        const track = videoEl.addTextTrack("subtitles", fmt(stream), lang);
        for (const c of cues) {
          try {
            track.addCue(new VTTCue(c.start, c.end, c.text));
          } catch {
            /* skip */
          }
        }
        track.mode = "showing";
        textTrackRef.current = track;
      } catch {
        /* fail silently */
      }
    },
    [videoEl, mediaPath, subtitleStreams],
  );

  useEffect(() => {
    const el = document.createElement("style");
    el.id = "iluha-sub-cue-styles";
    if (!document.getElementById("iluha-sub-cue-styles")) {
      el.textContent = `
        video::cue {
          font-size: 1.1em !important;
          background-color: rgba(0,0,0,0.75) !important;
          color: #fff !important;
          font-family: "Arial", "Helvetica", sans-serif !important;
          text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000 !important;
          line-height: 1.4 !important;
        }
      `;
      document.head.appendChild(el);
    }
  }, []);

  const hasTracks = audioStreams.length > 0 || subtitleStreams.length > 0;
  if (!hasTracks) return null;

  return (
    <section className="flex h-6 items-center gap-1 px-1 border-l-2 border-muted">
      {audioStreams.length > 0 && (
        <TrackSelect
          label="Аудио"
          tracks={audioStreams.map((s) => ({ index: s.index, label: fmt(s) }))}
          selected={selectedAudio}
          onChange={handleAudio}
        />
      )}
      {subtitleStreams.length > 0 && (
        <TrackSelect
          label="Сабы"
          tracks={subtitleStreams.map((s) => ({
            index: s.index,
            label: fmt(s),
          }))}
          selected={selectedSub}
          onChange={handleSub}
        />
      )}
    </section>
  );
}

export default Tracks;
