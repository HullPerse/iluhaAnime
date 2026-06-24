import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import type { VideoStreamInfo } from "@/types";
import { useState, useCallback, useRef, useEffect } from "react";
import { parseVTT } from "@/lib/index.utils";
import { saveTrackSelection, getTrackSelection } from "@/lib/storage.utils";
import { Check } from "lucide-react";
import AssOverlay from "./subtitles.player";

const SUB_OFF = -999;

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
        <span className="truncate">
          {label}: {current?.label ?? ""}
        </span>
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
  const [extAudio, setExtAudio] = useState<VideoStreamInfo[]>([]);
  const [extSubs, setExtSubs] = useState<VideoStreamInfo[]>([]);

  const mergedAudio = [...audioStreams, ...extAudio];
  const mergedSubs = [...subtitleStreams, ...extSubs];

  const defaultAudio =
    mergedAudio.find((s) => s.is_default)?.index ?? mergedAudio[0]?.index ?? -1;
  const defaultSub = mergedSubs[0]?.index ?? SUB_OFF;

  const savedAudio = getTrackSelection(mediaPath, "audio");
  const savedSub = getTrackSelection(mediaPath, "sub");

  const [selectedAudio, setSelectedAudio] = useState(
    savedAudio ?? defaultAudio,
  );
  const [selectedSub, setSelectedSub] = useState(savedSub ?? defaultSub);
  const textTrackRef = useRef<TextTrack | null>(null);
  const savedTimeRef = useRef(0);
  const savedPlayingRef = useRef(false);
  const extCounter = useRef(-1000);
  const audioGenRef = useRef(0);
  const subGenRef = useRef(0);

  const initializedRef = useRef(false);

  const [assUrl, setAssUrl] = useState<string | null>(null);
  const [assVisible, setAssVisible] = useState(false);
  const [subDelay, setSubDelay] = useState(0);
  const appliedOffsetRef = useRef(0);

  const fmt = (s: VideoStreamInfo) => {
    const parts = [
      (s.language ?? "").toUpperCase(),
      s.codec_name,
      s.title ?? "",
    ].filter(Boolean);
    return parts.join(" - ") || `Track ${s.index}`;
  };

  const isAssSub = (s: VideoStreamInfo) =>
    s.codec_name === "ass" ||
    s.codec_name === "ssa" ||
    (s.file_path ?? "").match(/\.(ass|ssa)$/i);

  const hasAssSub =
    mergedSubs.some(isAssSub) &&
    selectedSub !== SUB_OFF &&
    mergedSubs.find((s) => s.index === selectedSub && isAssSub(s));

  const handleAudio = useCallback(
    async (idx: number) => {
      setSelectedAudio(idx);
      saveTrackSelection(mediaPath, "audio", idx);

      const gen = ++audioGenRef.current;
      if (!videoEl) return;

      const stream = [...audioStreams, ...extAudio].find(
        (s) => s.index === idx,
      );
      if (!stream) return;

      savedTimeRef.current = videoEl.currentTime;
      savedPlayingRef.current = !videoEl.paused;

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

        if (gen !== audioGenRef.current) {
          onAudioSwitch(null);
          return;
        }

        onAudioSwitch(convertFileSrc(out));

        const restore = () => {
          try {
            videoEl.currentTime = savedTimeRef.current;
          } catch {}
          if (savedPlayingRef.current) {
            videoEl.play().catch(() => {});
          }
          videoEl.removeEventListener("loadedmetadata", restore);
        };
        videoEl.addEventListener("loadedmetadata", restore, { once: true });
      } catch {
        onAudioSwitch(null);
      }
    },
    [mediaPath, onAudioSwitch, videoEl, audioStreams, extAudio],
  );

  const loadSubtitle = useCallback(
    async (idx: number) => {
      if (!videoEl) return;

      const gen = ++subGenRef.current;

      if (textTrackRef.current) {
        textTrackRef.current.mode = "disabled";
        textTrackRef.current = null;
      }

      setAssUrl(null);
      setAssVisible(false);

      const stream = [...subtitleStreams, ...extSubs].find(
        (s) => s.index === idx,
      );
      if (!stream) return;

      try {
        const extracted = stream.file_path
          ? await invoke<string>("convert_external_subtitle", {
              path: stream.file_path,
              codecName: stream.codec_name,
            })
          : await invoke<string>("extract_video_subtitle", {
              path: mediaPath,
              streamIndex: idx,
              codecName: stream.codec_name,
            });

        if (gen !== subGenRef.current) return;

        const url = convertFileSrc(extracted);

        if (isAssSub(stream)) {
          setAssUrl(url);
          setAssVisible(true);
        } else {
          const resp = await fetch(url);
          const text = await resp.text();
          const cues = parseVTT(text);
          const lang = stream.language ?? "und";

          if (gen !== subGenRef.current) return;

          const track = videoEl.addTextTrack("subtitles", fmt(stream), lang);
          for (const c of cues) {
            try {
              track.addCue(new VTTCue(c.start, c.end, c.text));
            } catch {}
          }
          track.mode = "showing";
          textTrackRef.current = track;
        }
      } catch {}
    },
    [videoEl, mediaPath, subtitleStreams, extSubs],
  );

  const handleSub = useCallback(
    (idx: number) => {
      setSelectedSub(idx);
      saveTrackSelection(mediaPath, "sub", idx);
      if (idx === SUB_OFF) {
        if (textTrackRef.current) {
          textTrackRef.current.mode = "disabled";
          textTrackRef.current = null;
        }
        setAssVisible(false);
        setAssUrl(null);
        return;
      }
      loadSubtitle(idx);
    },
    [loadSubtitle, mediaPath],
  );

  const loadDelay = useCallback(() => {
    try {
      const d = parseFloat(
        localStorage.getItem(`sub_offset:${mediaPath}`) ?? "0",
      );
      setSubDelay(d);
    } catch {}
  }, [mediaPath]);

  useEffect(() => {
    if (initializedRef.current) return;
    if (!videoEl || (subtitleStreams.length === 0 && audioStreams.length === 0)) return;
    initializedRef.current = true;

    loadDelay();
    const savedA = getTrackSelection(mediaPath, "audio");
    const savedS = getTrackSelection(mediaPath, "sub");
    if (savedA !== undefined && savedA !== defaultAudio) {
      setSelectedAudio(savedA);
      handleAudio(savedA);
    } else if (savedA !== undefined) {
      setSelectedAudio(savedA);
    }
    if (savedS !== undefined) {
      setSelectedSub(savedS);
      if (savedS !== SUB_OFF) {
        loadSubtitle(savedS);
      }
    } else if (defaultSub >= 0) {
      loadSubtitle(defaultSub);
    }
  }, [videoEl, subtitleStreams.length, audioStreams.length, mediaPath, handleAudio, defaultAudio]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        path: string;
        offset: number;
      };
      if (detail.path === mediaPath) {
        setSubDelay(detail.offset);
        const delta = detail.offset - appliedOffsetRef.current;
        if (delta !== 0 && textTrackRef.current?.cues) {
          const track = textTrackRef.current;
          if (track.cues)
            for (let i = 0; i < track.cues.length; i++) {
              try {
                const c = track.cues[i] as VTTCue;
                c.startTime += delta;
                c.endTime += delta;
              } catch {}
            }
        }
        appliedOffsetRef.current = detail.offset;
      }
    };
    window.addEventListener("suboffsetchange", handler);
    return () => window.removeEventListener("suboffsetchange", handler);
  }, [mediaPath]);

  const handleAddAudio = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const file = await open({
        multiple: false,
        filters: [
          {
            name: "Audio",
            extensions: [
              "mp3",
              "aac",
              "m4a",
              "mka",
              "ac3",
              "eac3",
              "dts",
              "truehd",
              "flac",
              "ogg",
              "opus",
              "wav",
              "wma",
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
      setExtAudio((prev) => [...prev, newTrack]);
      handleAudio(idx);
    } catch {}
  }, [handleAudio]);

  const handleAddSub = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const file = await open({
        multiple: false,
        filters: [
          {
            name: "Subtitles",
            extensions: [
              "srt",
              "ass",
              "ssa",
              "vtt",
              "sub",
              "idx",
              "sup",
              "pgs",
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
      setExtSubs((prev) => [...prev, newTrack]);
      handleSub(idx);
    } catch {}
  }, [handleSub]);

  return (
    <section className="flex h-6 items-center gap-1 px-1 border-l-2 border-muted">
      <AssOverlay
        src={assUrl ?? ""}
        videoEl={videoEl}
        visible={assVisible && !!hasAssSub}
        delay={subDelay}
      />
      <TrackDropdown
        label="Аудио"
        tracks={
          mergedAudio.length > 0
            ? mergedAudio.map((s) => ({ index: s.index, label: fmt(s) }))
            : [{ index: -1, label: "—" }]
        }
        selected={mergedAudio.length > 0 ? selectedAudio : -1}
        onChange={handleAudio}
        onAdd={handleAddAudio}
      />
      <TrackDropdown
        label="Сабы"
        tracks={[
          { index: SUB_OFF, label: "Нет" },
          ...(mergedSubs.length > 0
            ? mergedSubs.map((s) => ({ index: s.index, label: fmt(s) }))
            : [{ index: -2, label: "—" }]),
        ]}
        selected={mergedSubs.length > 0 ? selectedSub : SUB_OFF}
        onChange={handleSub}
        onAdd={handleAddSub}
      />
    </section>
  );
}

export default Tracks;
