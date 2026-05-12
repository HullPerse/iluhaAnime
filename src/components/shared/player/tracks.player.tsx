import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import type { VideoStreamInfo } from "@/types";
import { useState, useCallback, useRef, useEffect } from "react";
import { parseVTT } from "@/lib/utils";
import { Check } from "lucide-react";

function TrackDropdown({
  label,
  tracks,
  selected,
  onChange,
  onAdd,
}: {
  label: string;
  tracks: { index: number; label: string }[];
  selected: number;
  onChange: (index: number) => void;
  onAdd?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current = tracks.find((t) => t.index === selected);

  return (
    <div ref={ref} className="relative flex items-center gap-0.5">
      <button
        className="flex items-center gap-1 h-5 text-[10px] windows95-font bg-primary windows95-border px-1 min-w-18 max-w-24 outline-none focus-visible:outline-dotted focus-visible:outline-1 focus-visible:outline-offset-[-3px]"
        onClick={() => setOpen(!open)}
      >
        <span className="truncate">{label}: {current?.label ?? ""}</span>
      </button>
      {onAdd && (
        <button
          className="flex items-center justify-center size-4 text-[10px] windows95-font bg-primary windows95-border leading-none"
          onClick={onAdd}
          title={`Add ${label.toLowerCase()} track`}
        >
          +
        </button>
      )}
      {open && (
        <div className="absolute bottom-full left-0 mb-0.5 min-w-full windows95-border bg-primary z-50 shadow-lg">
          {tracks.map((t) => (
            <button
              key={t.index}
              className="flex items-center gap-1 w-full text-left px-1 py-0.5 text-[10px] windows95-font hover:bg-secondary hover:text-white whitespace-nowrap"
              onClick={() => {
                onChange(t.index);
                setOpen(false);
              }}
            >
              {t.index === selected ? (
                <Check className="size-3 shrink-0" />
              ) : (
                <span className="size-3 shrink-0" />
              )}
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
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
  const defaultAudio =
    audioStreams.find((s) => s.is_default)?.index ?? audioStreams[0]?.index ?? -1;
  const defaultSub = subtitleStreams[0]?.index ?? -1;
  const [selectedAudio, setSelectedAudio] = useState(defaultAudio);
  const [selectedSub, setSelectedSub] = useState(defaultSub);
  const textTrackRef = useRef<TextTrack | null>(null);
  const pendingAudioRef = useRef(false);
  const savedTimeRef = useRef(0);
  const savedPlayingRef = useRef(false);
  const extCounter = useRef(-1000);

  const fmt = (s: VideoStreamInfo) => {
    const parts = [
      (s.language ?? "").toUpperCase(),
      s.codec_name,
      s.title ?? "",
    ].filter(Boolean);
    return parts.join(" - ") || `Track ${s.index}`;
  };

  const getStream = useCallback(
    (idx: number, list: VideoStreamInfo[]) =>
      list.find((s) => s.index === idx) ?? null,
    [],
  );

  const handleAudio = useCallback(
    async (idx: number) => {
      setSelectedAudio(idx);
      if (pendingAudioRef.current || !videoEl) return;

      const stream = getStream(idx, audioStreams);
      if (!stream) return;

      savedTimeRef.current = videoEl.currentTime;
      savedPlayingRef.current = !videoEl.paused;

      pendingAudioRef.current = true;
      try {
        const out = stream.file_path
          ? await invoke<string>("remux_with_external_audio", {
              videoPath: mediaPath,
              audioPath: stream.file_path,
            })
          : await invoke<string>("remux_video_audio", {
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
    [mediaPath, onAudioSwitch, videoEl, audioStreams, getStream],
  );

  const loadSubtitle = useCallback(
    async (idx: number) => {
      if (!videoEl) return;

      if (textTrackRef.current) {
        textTrackRef.current.mode = "disabled";
        textTrackRef.current = null;
      }

      const stream = subtitleStreams.find((s) => s.index === idx);
      if (!stream) return;

      try {
        const extracted = stream.file_path
          ? await invoke<string>("convert_external_subtitle", {
              path: stream.file_path,
            })
          : await invoke<string>("extract_video_subtitle", {
              path: mediaPath,
              streamIndex: idx,
            });
        const url = convertFileSrc(extracted);
        const resp = await fetch(url);
        const text = await resp.text();
        const cues = parseVTT(text);
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

  const handleSub = useCallback(
    (idx: number) => {
      setSelectedSub(idx);
      loadSubtitle(idx);
    },
    [loadSubtitle],
  );

  useEffect(() => {
    if (videoEl && defaultSub >= 0) {
      loadSubtitle(defaultSub);
    }
  }, [videoEl]);

  const handleAddAudio = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const file = await open({
        multiple: false,
        filters: [
          {
            name: "Audio",
            extensions: [
              "mp3", "aac", "m4a", "mka", "ac3", "eac3", "dts",
              "truehd", "flac", "ogg", "opus", "wav", "wma",
            ],
          },
          { name: "All Files", extensions: ["*"] },
        ],
      });
      if (!file) return;
      const idx = extCounter.current--;
      const newTrack: VideoStreamInfo = {
        index: idx,
        codec_type: "audio",
        codec_name: file.split(".").pop()?.toLowerCase() ?? "",
        language: null,
        title: file.split(/[/\\]/).pop() ?? "Audio",
        is_default: false,
        file_path: file,
      };
      audioStreams.push(newTrack);
      handleAudio(idx);
    } catch {
      /* cancelled */
    }
  }, [audioStreams, handleAudio]);

  const handleAddSub = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const file = await open({
        multiple: false,
        filters: [
          {
            name: "Subtitles",
            extensions: [
              "srt", "ass", "ssa", "vtt", "sub", "idx", "sup", "pgs",
            ],
          },
          { name: "All Files", extensions: ["*"] },
        ],
      });
      if (!file) return;
      const idx = extCounter.current--;
      const newTrack: VideoStreamInfo = {
        index: idx,
        codec_type: "subtitle",
        codec_name: file.split(".").pop()?.toLowerCase() ?? "",
        language: null,
        title: file.split(/[/\\]/).pop() ?? "Subtitles",
        is_default: false,
        file_path: file,
      };
      subtitleStreams.push(newTrack);
      handleSub(idx);
    } catch {
      /* cancelled */
    }
  }, [subtitleStreams, handleSub]);

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
        <TrackDropdown
          label="Аудио"
          tracks={audioStreams.map((s) => ({ index: s.index, label: fmt(s) }))}
          selected={selectedAudio}
          onChange={handleAudio}
          onAdd={handleAddAudio}
        />
      )}
      {subtitleStreams.length > 0 && (
        <TrackDropdown
          label="Сабы"
          tracks={subtitleStreams.map((s) => ({
            index: s.index,
            label: fmt(s),
          }))}
          selected={selectedSub}
          onChange={handleSub}
          onAdd={handleAddSub}
        />
      )}
    </section>
  );
}

export default Tracks;
