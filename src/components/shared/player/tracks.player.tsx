import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import type { VideoStreamInfo } from "@/types";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { parseVTT } from "@/lib/index.utils";
import { useMediaStore } from "@/store/media.store";
import { showToast } from "@/lib/toast.utils";
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
  const [open, setOpen] = useState<boolean>(false);
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
        className="flex items-center gap-1 h-5 text-[10px] windows95-font windows95-border px-1 min-w-18 max-w-24 outline-none focus-visible:outline-dotted focus-visible:outline-1 focus-visible:outline-offset-[-3px] hover:cursor-pointer bg-white"
        onClick={() => setOpen(!open)}
      >
        <span className="truncate">
          {label}: {current?.label ?? ""}
        </span>
      </button>
      {onAdd && (
        <button
          className="flex items-center justify-center size-4 windows95-text hover:cursor-pointer windows95-border leading-none bg-white"
          onClick={onAdd}
          title={`Add ${label.toLowerCase()} track`}
        >
          +
        </button>
      )}
      {open && (
        <div className="absolute bottom-full left-0 mb-0.5 min-w-full windows95-border bg-primary z-50 max-w-mdl w-md">
          {tracks.map((t) => (
            <button
              key={t.index}
              className="flex items-center gap-1 w-full text-left px-1 py-0.5 windows95-text bg-white hover:bg-secondary hover:text-white whitespace-nowrap hover:cursor-pointer max-w-md line-clamp-1"
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
  audioReady,
  autoAudio,
  autoSubs,
}: {
  audioStreams: VideoStreamInfo[];
  subtitleStreams: VideoStreamInfo[];
  mediaPath: string;
  videoEl: HTMLVideoElement | null;
  onAudioSwitch: (newSrc: string | null) => void;
  audioReady?: boolean;
  autoAudio?: string[];
  autoSubs?: string[];
}) {
  const [extAudio, setExtAudio] = useState<VideoStreamInfo[]>([]);
  const [extSubs, setExtSubs] = useState<VideoStreamInfo[]>([]);
  const extCounter = useRef<number>(-1000);

  const autoTracks = useMemo(() => {
    const res: VideoStreamInfo[] = [];
    for (const f of autoAudio ?? []) {
      const idx = extCounter.current--;
      res.push({
        index: idx,
        codec_type: "audio",
        codec_name: f.split(".").pop()?.toLowerCase() ?? "",
        language: null,
        title: f.split(/[/\\]/).pop() ?? "Audio",
        is_default: false,
        file_path: f,
      });
    }
    for (const f of autoSubs ?? []) {
      const idx = extCounter.current--;
      res.push({
        index: idx,
        codec_type: "subtitle",
        codec_name: f.split(".").pop()?.toLowerCase() ?? "",
        language: null,
        title: f.split(/[/\\]/).pop() ?? "Subtitles",
        is_default: false,
        file_path: f,
      });
    }
    return res;
  }, [autoAudio, autoSubs]);

  const mergedAudio = [
    ...audioStreams,
    ...extAudio,
    ...autoTracks.filter((t) => t.codec_type === "audio"),
  ];
  const mergedSubs = [
    ...subtitleStreams,
    ...extSubs,
    ...autoTracks.filter((t) => t.codec_type === "subtitle"),
  ];

  const mediaGet = useMediaStore((s) => s.getEntry);
  const mediaSetTrack = useMediaStore((s) => s.setTrack);

  const defaultAudio =
    mergedAudio.find((s) => s.is_default)?.index ?? mergedAudio[0]?.index ?? -1;
  const defaultSub = mergedSubs[0]?.index ?? SUB_OFF;

  const savedAudio = mediaGet(mediaPath)?.audioTrack;
  const savedSub = mediaGet(mediaPath)?.subtitleTrack;

  const [selectedAudio, setSelectedAudio] = useState(
    savedAudio ?? defaultAudio,
  );
  const [selectedSub, setSelectedSub] = useState<number>(
    savedSub ?? defaultSub,
  );
  const textTrackRef = useRef<TextTrack | null>(null);
  const savedTimeRef = useRef<number>(0);
  const savedPlayingRef = useRef<boolean>(false);
  const audioGenRef = useRef<number>(0);
  const subGenRef = useRef<number>(0);

  const initializedRef = useRef<boolean>(false);
  const subTrackElRef = useRef<HTMLTrackElement | null>(null);
  const subBlobUrlRef = useRef<string | null>(null);
  const tempFilesRef = useRef<string[]>([]);
  const audioPrefetchRef = useRef<Map<number, string>>(new Map());
  const audioPrefetchingRef = useRef<Set<number>>(new Set());

  const [assUrl, setAssUrl] = useState<string | null>(null);
  const [assFonts, setAssFonts] = useState<string[]>([]);
  const [assVisible, setAssVisible] = useState<boolean>(false);
  const [subDelay, setSubDelay] = useState<number>(0);
  const appliedOffsetRef = useRef<number>(0);

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
    async (idx: number, restoreTime?: number) => {
      setSelectedAudio(idx);
      mediaSetTrack(mediaPath, "audio", idx);

      const gen = ++audioGenRef.current;
      if (!videoEl) return;

      const stream = [...audioStreams, ...extAudio].find(
        (s) => s.index === idx,
      );
      if (!stream) return;

      savedTimeRef.current = restoreTime ?? videoEl.currentTime;
      savedPlayingRef.current = !videoEl.paused;

      const setSrcAndRestore = (path: string) => {
        if (gen !== audioGenRef.current) return;
        tempFilesRef.current.push(path);
        onAudioSwitch(convertFileSrc(path));
        const seekHint = () => {
          try { videoEl.currentTime = savedTimeRef.current; } catch {}
        };
        const restore = () => {
          seekHint();
          if (savedPlayingRef.current) videoEl.play().catch(() => {});
        };
        videoEl.addEventListener("loadedmetadata", seekHint, { once: true });
        requestAnimationFrame(() => {
          if (videoEl.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
            restore();
          } else {
            videoEl.addEventListener("canplay", restore, { once: true });
          }
        });
      };

      const cached = audioPrefetchRef.current.get(idx);
      if (cached) {
        setSrcAndRestore(cached);
        return;
      }

      const audioDelay = Math.round((mediaGet(mediaPath)?.audioOffset ?? 0) * 1000);

      try {
        for (const p of tempFilesRef.current) {
          invoke("cleanup_temp_file", { path: p }).catch(() => {});
        }
        tempFilesRef.current = [];

        const out = await (stream.file_path
          ? invoke<string>("remux_with_external_audio", {
              videoPath: mediaPath,
              audioPath: stream.file_path,
              audioDelayMs: audioDelay,
            })
          : invoke<string>("remux_video_audio", {
              path: mediaPath,
              streamIndex: idx,
              audioDelayMs: audioDelay,
            }));

        if (gen !== audioGenRef.current) {
          invoke("cleanup_temp_file", { path: out }).catch(() => {});
          onAudioSwitch(null);
          return;
        }

        setSrcAndRestore(out);
      } catch {
        const fallbackTime = savedTimeRef.current;
        const wasPlaying = savedPlayingRef.current;
        onAudioSwitch(null);
        const seekHintFallback = () => {
          try { videoEl.currentTime = fallbackTime; } catch {}
        };
        const restoreFallback = () => {
          seekHintFallback();
          if (wasPlaying) videoEl.play().catch(() => {});
        };
        videoEl.addEventListener("loadedmetadata", seekHintFallback, { once: true });
        requestAnimationFrame(() => {
          if (videoEl.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
            restoreFallback();
          } else {
            videoEl.addEventListener("canplay", restoreFallback, { once: true });
          }
        });
        showToast("Не удалось переключить аудиодорожку", "error");
      }
    },
    [mediaPath, onAudioSwitch, videoEl, audioStreams, extAudio],
  );

  const loadSubtitle = useCallback(
    async (idx: number) => {
      if (!videoEl) return;

      const gen = ++subGenRef.current;

      if (subTrackElRef.current) {
        subTrackElRef.current.remove();
        subTrackElRef.current = null;
      }
      if (subBlobUrlRef.current) {
        URL.revokeObjectURL(subBlobUrlRef.current);
        subBlobUrlRef.current = null;
      }
      textTrackRef.current = null;

      setAssUrl(null);
      setAssVisible(false);

      const stream = [...subtitleStreams, ...extSubs].find(
        (s) => s.index === idx,
      );
      if (!stream) return;

      try {
        let extractedPath: string;
        let fontPaths: string[];

        if (stream.file_path) {
          extractedPath = await invoke<string>("convert_external_subtitle", {
            path: stream.file_path,
            codecName: stream.codec_name,
          });
          fontPaths = [];
        } else {
          const result = await invoke<{ subtitle: string; fonts: string[] }>(
            "extract_video_subtitle",
            {
              path: mediaPath,
              streamIndex: idx,
              codecName: stream.codec_name,
            },
          );
          extractedPath = result.subtitle;
          fontPaths = result.fonts;
        }

        if (gen !== subGenRef.current) {
          invoke("cleanup_temp_file", { path: extractedPath }).catch(() => {});
          for (const fp of fontPaths)
            invoke("cleanup_temp_file", { path: fp }).catch(() => {});
          return;
        }

        const url = convertFileSrc(extractedPath);
        tempFilesRef.current.push(extractedPath, ...fontPaths);

        if (isAssSub(stream)) {
          setAssUrl(url);
          setAssFonts(fontPaths);
          setAssVisible(true);
        } else {
          const resp = await fetch(url);
          const text = await resp.text();
          const cues = parseVTT(text);
          const lang = stream.language ?? "und";

          if (gen !== subGenRef.current) return;

          const fmtTime = (t: number) => {
            const h = Math.floor(t / 3600);
            const m = Math.floor((t % 3600) / 60);
            const s = (t % 60).toFixed(3).padStart(6, "0");
            return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${s}`;
          };
          const vttLines = ["WEBVTT"];
          for (const c of cues) {
            const timing = c.settings
              ? `${fmtTime(c.start)} --> ${fmtTime(c.end)} ${c.settings}`
              : `${fmtTime(c.start)} --> ${fmtTime(c.end)}`;
            vttLines.push(
              "",
              timing,
              c.text,
            );
          }
          const blob = new Blob([vttLines.join("\n")], { type: "text/vtt" });
          const blobUrl = URL.createObjectURL(blob);

          const trackEl = document.createElement("track");
          trackEl.kind = "subtitles";
          trackEl.label = fmt(stream);
          trackEl.srclang = lang;

          trackEl.addEventListener(
            "load",
            () => {
              requestAnimationFrame(() => {
                trackEl.track.mode = "showing";
              });
            },
            { once: true },
          );
          trackEl.src = blobUrl;
          videoEl.appendChild(trackEl);

          subTrackElRef.current = trackEl;
          subBlobUrlRef.current = blobUrl;
          textTrackRef.current = trackEl.track;
        }
      } catch {}
    },
    [videoEl, mediaPath, subtitleStreams, extSubs],
  );

  const handleSub = useCallback(
    (idx: number) => {
      setSelectedSub(idx);
      mediaSetTrack(mediaPath, "sub", idx);
      if (idx === SUB_OFF) {
        if (subTrackElRef.current) {
          subTrackElRef.current.remove();
          subTrackElRef.current = null;
        }
        if (subBlobUrlRef.current) {
          URL.revokeObjectURL(subBlobUrlRef.current);
          subBlobUrlRef.current = null;
        }
        textTrackRef.current = null;
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
      const d = mediaGet(mediaPath)?.subOffset ?? 0;
      setSubDelay(d);
    } catch {}
  }, [mediaPath, mediaGet]);

  useEffect(() => {
    if (initializedRef.current) return;
    if (!videoEl || (subtitleStreams.length === 0 && audioStreams.length === 0))
      return;
    initializedRef.current = true;

    loadDelay();
    const savedA = mediaGet(mediaPath)?.audioTrack;
    const savedS = mediaGet(mediaPath)?.subtitleTrack;

    if (savedA !== undefined) {
      setSelectedAudio(savedA);
      if (!audioReady && savedA !== defaultAudio) {
        const pos = mediaGet(mediaPath)?.position;
        handleAudio(savedA, pos);
      }
    } else {
      setSelectedAudio(defaultAudio);
    }

    if (savedS !== undefined) {
      setSelectedSub(savedS);
      if (savedS !== SUB_OFF) loadSubtitle(savedS);
    } else if (defaultSub >= 0) {
      setSelectedSub(defaultSub);
      loadSubtitle(defaultSub);
    } else {
      setSelectedSub(SUB_OFF);
    }
  }, [
    videoEl,
    subtitleStreams,
    audioStreams,
    mediaPath,
    handleAudio,
    defaultAudio,
    defaultSub,
    loadDelay,
  ]);

  useEffect(() => {
    if (!mediaPath) return;
    const prefetched = audioPrefetchRef.current;
    const inflight = audioPrefetchingRef.current;
    const allStreams = [...audioStreams, ...extAudio];
    const delay = Math.round((mediaGet(mediaPath)?.audioOffset ?? 0) * 1000);
    for (const s of allStreams) {
      if (prefetched.has(s.index) || inflight.has(s.index)) continue;
      inflight.add(s.index);
      const p = s.file_path
        ? invoke<string>("remux_with_external_audio", {
            videoPath: mediaPath,
            audioPath: s.file_path,
            audioDelayMs: delay,
          })
        : invoke<string>("remux_video_audio", {
            path: mediaPath,
            streamIndex: s.index,
            audioDelayMs: delay,
          });
      p.then((path) => {
        tempFilesRef.current.push(path);
        prefetched.set(s.index, path);
      }).catch(() => {})
       .finally(() => { inflight.delete(s.index); });
    }
  }, [mediaPath, audioStreams, extAudio]);

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

  useEffect(() => {
    return () => {
      if (subTrackElRef.current) subTrackElRef.current.remove();
      if (subBlobUrlRef.current) URL.revokeObjectURL(subBlobUrlRef.current);
      for (const p of tempFilesRef.current) {
        invoke("cleanup_temp_file", { path: p }).catch(() => {});
      }
      tempFilesRef.current = [];
    };
  }, []);

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
    <section className="flex h-6 items-center gap-1 px-1">
      <AssOverlay
        src={assUrl ?? ""}
        videoEl={videoEl}
        visible={assVisible && !!hasAssSub}
        delay={subDelay}
        fonts={assFonts}
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
