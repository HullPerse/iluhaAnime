import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import type { VideoStreamInfo } from "@/types";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { parseVTT } from "@/lib/index.utils";
import { useMediaStore } from "@/store/media.store";
import { showToast } from "@/lib/toast.utils";
import AssOverlay from "./subtitles.player";
import TrackDropdown from "./tracks/dropdown.tracks";
import { formatStreams, isAssSub } from "@/lib/player.utils";
import { selectBestTrack } from "@/lib/track-preferences";
import { useSettingsStore } from "@/store/settings.store";

const SUB_OFF = -999;

const COPY_CODECS = new Set(["aac", "mp3", "flac", "opus", "vorbis"]);
const isCopyCodec = (codec: string) => COPY_CODECS.has(codec.toLowerCase());

function Tracks({
  audioStreams,
  subtitleStreams,
  mediaPath,
  videoEl,
  onAudioSrcChange,
  autoAudio,
  autoSubs,
  subPath: initialSubPath,
  subFonts: initialSubFonts,
  subIsAss: initialSubIsAss,
  initialAudioPath,
}: {
  audioStreams: VideoStreamInfo[];
  subtitleStreams: VideoStreamInfo[];
  mediaPath: string;
  videoEl: HTMLVideoElement | null;
  onAudioSrcChange: (src: string | null) => void;
  autoAudio?: string[];
  autoSubs?: string[];
  subPath?: string;
  subFonts?: string[];
  subIsAss?: boolean;
  initialAudioPath?: string;
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
        is_forced: false,
        is_comment: false,
        bit_rate: null,
        channels: null,
        sample_rate: null,
        width: null,
        height: null,
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
        is_forced: false,
        is_comment: false,
        bit_rate: null,
        channels: null,
        sample_rate: null,
        width: null,
        height: null,
        file_path: f,
      });
    }
    return res;
  }, [autoAudio, autoSubs]);

  const mergedAudio = useMemo(() => [
    ...audioStreams,
    ...extAudio,
    ...autoTracks.filter((t) => t.codec_type === "audio"),
  ], [audioStreams, extAudio, autoTracks]);
  const mergedSubs = useMemo(() => [
    ...subtitleStreams,
    ...extSubs,
    ...autoTracks.filter((t) => t.codec_type === "subtitle"),
  ], [subtitleStreams, extSubs, autoTracks]);

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
  const subGenRef = useRef<number>(0);
  const subTrackElRef = useRef<HTMLTrackElement | null>(null);
  const subBlobUrlRef = useRef<string | null>(null);
  const tempFilesRef = useRef<string[]>([]);
  const audioExtractCache = useRef<Map<string, string>>(new Map());
  const audioExtracting = useRef<Set<string>>(new Set());
  const subExtractCache = useRef<Map<string, string>>(new Map());
  const [, setCacheVersion] = useState(0);
  const bumpCacheVersion = useCallback(() => setCacheVersion((v) => v + 1), []);
  const audioLoadingRef = useRef(false);
  const extractStartRef = useRef<number | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractElapsed, setExtractElapsed] = useState(0);
  const [extractProgress, setExtractProgress] = useState<number | undefined>(undefined);
  const extractProgressIdRef = useRef<number | null>(null);
  const bestEncoderRef = useRef<string>("aac");
  const batchRunningRef = useRef(false);
  const batchDoneRef = useRef<string | null>(null);
  const [videoStarted, setVideoStarted] = useState(false);

  // Probe for best encoder once on mount
  useEffect(() => {
    invoke<string[]>("probe_encoders")
      .then((encoders) => {
        bestEncoderRef.current = encoders[0] || "aac";
      })
      .catch(() => {});
  }, []);

  // Track when video starts playing
  useEffect(() => {
    if (!videoEl) return;
    const handler = () => setVideoStarted(true);
    videoEl.addEventListener("play", handler);
    return () => videoEl.removeEventListener("play", handler);
  }, [videoEl]);

  // Update elapsed time while extracting
  useEffect(() => {
    if (!isExtracting) {
      setExtractElapsed(0);
      return;
    }
    const id = setInterval(() => {
      if (extractStartRef.current) {
        setExtractElapsed(Math.floor((Date.now() - extractStartRef.current) / 1000));
      }
    }, 200);
    return () => clearInterval(id);
  }, [isExtracting]);

  // Poll progress from registry while extracting
  useEffect(() => {
    if (!isExtracting || extractProgressIdRef.current === null) {
      setExtractProgress(undefined);
      return;
    }
    const id = setInterval(async () => {
      if (extractProgressIdRef.current === null) return;
      try {
        const pct = await invoke<number | null>("get_progress", {
          id: extractProgressIdRef.current,
        });
        if (pct !== null) {
          setExtractProgress(pct);
        }
      } catch {}
    }, 300);
    return () => clearInterval(id);
  }, [isExtracting]);

  const [assUrl, setAssUrl] = useState<string | null>(null);
  const [assFonts, setAssFonts] = useState<string[]>([]);
  const [assVisible, setAssVisible] = useState<boolean>(false);
  const [subDelay, setSubDelay] = useState<number>(0);

  const hasAssSub =
    mergedSubs.some(isAssSub) &&
    selectedSub !== SUB_OFF &&
    mergedSubs.find((s) => s.index === selectedSub && isAssSub(s));

  const fallbackLock = useRef(false);

  const canPlayNative = useCallback((codec: string): boolean => {
    const a = document.createElement("audio");
    const map: Record<string, string> = {
      aac: 'audio/mp4; codecs="mp4a.40.2"',
      mp3: "audio/mpeg",
      flac: "audio/flac",
      opus: 'audio/webm; codecs="opus"',
      vorbis: 'audio/webm; codecs="vorbis"',
      ac3: 'audio/mp4; codecs="ac-3"',
      eac3: 'audio/mp4; codecs="ec-3"',
    };
    const mt = map[codec.toLowerCase()];
    if (!mt) return false;
    const r = a.canPlayType(mt);
    return r === "probably" || r === "maybe";
  }, []);

  const handleAudio = useCallback(
    async (idx: number, forceTranscode?: boolean) => {
      setSelectedAudio(idx);
      mediaSetTrack(mediaPath, "audio", idx);

      const stream = mergedAudio.find((s) => s.index === idx);
      if (!stream) {
        onAudioSrcChange(null);
        return;
      }

      if (stream.file_path) {
        onAudioSrcChange(convertFileSrc(stream.file_path));
        return;
      }

      const key = `${mediaPath}:${idx}`;
      const cached = audioExtractCache.current.get(key);
      if (cached) {
        onAudioSrcChange(convertFileSrc(cached));
        return;
      }

      audioLoadingRef.current = true;
      setIsExtracting(true);
      setExtractProgress(0);
      extractStartRef.current = Date.now();
      audioExtracting.current.add(key);
      bumpCacheVersion();
      try {
        const shouldTranscode =
          forceTranscode || !canPlayNative(stream.codec_name);
        const result = await invoke<{ path: string; progressId: number }>("extract_audio_track", {
          path: mediaPath,
          streamIndex: idx,
          codecName: stream.codec_name,
          forceTranscode: shouldTranscode,
          encoder: shouldTranscode ? bestEncoderRef.current : undefined,
        });
        extractProgressIdRef.current = result.progressId;
        audioExtractCache.current.set(key, result.path);
        if (!result.path.includes("iluha_audio_cache")) {
          tempFilesRef.current.push(result.path);
        }
        onAudioSrcChange(convertFileSrc(result.path));
      } catch {
        // If normal extraction fails, try transcode as fallback
        if (!forceTranscode) {
          showToast("Прямое копирование не удалось, перекодируем...", "info");
          handleAudio(idx, true);
        } else {
          onAudioSrcChange(null);
          showToast("Не удалось переключить аудиодорожку", "error");
        }
      } finally {
        audioLoadingRef.current = false;
        setIsExtracting(false);
        setExtractProgress(undefined);
        extractProgressIdRef.current = null;
        audioExtracting.current.delete(key);
        bumpCacheVersion();
      }
    },
    [mediaPath, onAudioSrcChange, mergedAudio, canPlayNative],
  );

  const loadSubtitle = useCallback(
    async (idx: number, preExtractedPath?: string) => {
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

      setAssUrl(null);
      setAssVisible(false);

      const stream = mergedSubs.find(
        (s) => s.index === idx,
      );
      if (!stream) return;

      const unsupported = new Set([
        "hdmv_pgs_subtitle", "dvd_subtitle", "dvdsub",
        "dvb_subtitle", "xsub", "pgssub", "dvd",
      ]);
      if (unsupported.has(stream.codec_name.toLowerCase())) {
        showToast(`Формат субтитров "${stream.codec_name}" не поддерживается`, "error");
        return;
      }

      try {
        let extractedPath: string;
        let fontPaths: string[];

        if (preExtractedPath) {
          extractedPath = preExtractedPath;
          fontPaths = [];
        } else if (stream.file_path) {
          const cacheKey = `ext:${stream.file_path}`;
          const cached = subExtractCache.current.get(cacheKey);
          if (cached) {
            if (gen !== subGenRef.current) return;
            extractedPath = cached;
            fontPaths = [];
          } else {
            extractedPath = await invoke<string>("convert_external_subtitle", {
              path: stream.file_path,
              codecName: stream.codec_name,
            });
            subExtractCache.current.set(cacheKey, extractedPath);
            fontPaths = [];
          }
        } else {
          const cacheKey = `${mediaPath}:${idx}`;
          const cached = subExtractCache.current.get(cacheKey);
          if (cached) {
            if (gen !== subGenRef.current) return;
            extractedPath = cached;
            fontPaths = [];
          } else {
            const result = await invoke<{ subtitle: string; fonts: string[]; progressId: number }>(
              "extract_video_subtitle",
              {
                path: mediaPath,
                streamIndex: idx,
                codecName: stream.codec_name,
              },
            );
            extractedPath = result.subtitle;
            fontPaths = result.fonts;
            subExtractCache.current.set(cacheKey, extractedPath);
          }
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
          const offset = mediaGet(mediaPath)?.subOffset ?? 0;

          if (gen !== subGenRef.current) return;

          const fmtTime = (t: number) => {
            const h = Math.floor(t / 3600);
            const m = Math.floor((t % 3600) / 60);
            const s = (t % 60).toFixed(3).padStart(6, "0");
            return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${s}`;
          };
          const vttLines = ["WEBVTT"];
          for (const c of cues) {
            const start = c.start + offset;
            const end = c.end + offset;
            const timing = c.settings
              ? `${fmtTime(start)} --> ${fmtTime(end)} ${c.settings}`
              : `${fmtTime(start)} --> ${fmtTime(end)}`;
            vttLines.push("", timing.trim(), c.text);
          }
          const blob = new Blob([vttLines.join("\n")], { type: "text/vtt" });
          const blobUrl = URL.createObjectURL(blob);

          const trackEl = document.createElement("track");
          trackEl.kind = "subtitles";
          trackEl.label = formatStreams(stream);
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
        }
      } catch (e) {
        showToast(`Не удалось загрузить субтитры: ${e}`, "error");
      }
    },
    [videoEl, mediaPath, mergedSubs, mediaGet],
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

  const initializedRef = useRef<string | null>(null);

  // Initialize on mount / file change
  useEffect(() => {
    if (!videoEl || (subtitleStreams.length === 0 && audioStreams.length === 0))
      return;
    if (initializedRef.current === mediaPath) return;
    initializedRef.current = mediaPath;

    loadDelay();

    const prefs = useSettingsStore.getState();
    const savedA = mediaGet(mediaPath)?.audioTrack;
    const savedS = mediaGet(mediaPath)?.subtitleTrack;

    // Audio selection
    let targetAudio: number;
    if (savedA !== undefined) {
      targetAudio = savedA;
    } else {
      const best = selectBestTrack(
        mergedAudio,
        {
          preferredAudioLangs: prefs.preferredAudioLangs,
          preferredAudioPatterns: prefs.preferredAudioPatterns,
          preferredSubLangs: [],
          preferredSubPatterns: [],
          preferForcedSubs: false,
          fallbackToFirstTrack: prefs.fallbackToFirstTrack,
        },
        "audio",
      );
      targetAudio = best ?? mergedAudio.find((s) => !s.is_comment)?.index ?? -1;
    }

    setSelectedAudio(targetAudio);
    if (initialAudioPath) {
      // Pre-populate cache with pre-extracted path
      audioExtractCache.current.set(`${mediaPath}:${targetAudio}`, initialAudioPath);
      onAudioSrcChange(convertFileSrc(initialAudioPath));
    } else if (targetAudio >= 0) {
      handleAudio(targetAudio);
    }

    // Subtitle selection
    let targetSub: number;
    if (savedS !== undefined) {
      targetSub = savedS;
    } else {
      const best = selectBestTrack(
        mergedSubs,
        {
          preferredAudioLangs: [],
          preferredAudioPatterns: [],
          preferredSubLangs: prefs.preferredSubLangs,
          preferredSubPatterns: prefs.preferredSubPatterns,
          preferForcedSubs: prefs.preferForcedSubs,
          fallbackToFirstTrack: prefs.fallbackToFirstTrack,
        },
        "subtitle",
      );
      targetSub = best ?? SUB_OFF;
    }

    setSelectedSub(targetSub);
    if (initialSubPath && targetSub !== SUB_OFF) {
      const url = convertFileSrc(initialSubPath);
      tempFilesRef.current.push(initialSubPath, ...(initialSubFonts ?? []));
      if (initialSubIsAss) {
        setAssUrl(url);
        setAssFonts(initialSubFonts ?? []);
        setAssVisible(true);
      } else {
        loadSubtitle(targetSub, initialSubPath);
      }
    } else if (targetSub !== SUB_OFF) {
      loadSubtitle(targetSub);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoEl, subtitleStreams, audioStreams, mediaPath, defaultAudio, defaultSub, loadDelay, handleAudio, loadSubtitle]);

  // Background extraction: extract all non-selected tracks once after video starts
  useEffect(() => {
    if (!mediaPath || !selectedAudio || !videoStarted) return;
    if (batchRunningRef.current) return;
    if (batchDoneRef.current === mediaPath) return;

    const remaining = [...audioStreams, ...extAudio].filter(
      (s) =>
        !s.file_path &&
        s.index !== selectedAudio &&
        !audioExtractCache.current.has(`${mediaPath}:${s.index}`) &&
        !audioExtracting.current.has(`${mediaPath}:${s.index}`),
    );
    const remainingSubs = [...subtitleStreams, ...extSubs].filter(
      (s) =>
        !s.file_path &&
        s.index !== selectedSub &&
        !subExtractCache.current.has(`${mediaPath}:${s.index}`),
    );
    if (remaining.length === 0 && remainingSubs.length === 0) {
      batchDoneRef.current = mediaPath;
      return;
    }

    batchRunningRef.current = true;
    const maxParallel = 3;

    const extractAudioBatch = async () => {
      for (let i = 0; i < remaining.length; i += maxParallel) {
        const chunk = remaining.slice(i, i + maxParallel);
        await Promise.all(
          chunk.map(async (s) => {
            const key = `${mediaPath}:${s.index}`;
            audioExtracting.current.add(key);
            bumpCacheVersion();
            try {
              const result = await invoke<{ path: string; progressId: number }>("extract_audio_track", {
                path: mediaPath,
                streamIndex: s.index,
                codecName: s.codec_name,
                forceTranscode: false,
              });
              audioExtractCache.current.set(key, result.path);
              if (!result.path.includes("iluha_audio_cache")) {
                tempFilesRef.current.push(result.path);
              }
            } catch {
              // silently fail for background extraction
            } finally {
              audioExtracting.current.delete(key);
              bumpCacheVersion();
            }
          }),
        );
      }
    };

    const extractSubBatch = async () => {
      for (let i = 0; i < remainingSubs.length; i += maxParallel) {
        const chunk = remainingSubs.slice(i, i + maxParallel);
        await Promise.all(
          chunk.map(async (s) => {
            try {
              const result = await invoke<{ subtitle: string; fonts: string[]; progressId: number }>(
                "extract_video_subtitle",
                {
                  path: mediaPath,
                  streamIndex: s.index,
                  codecName: s.codec_name,
                },
              );
              subExtractCache.current.set(`${mediaPath}:${s.index}`, result.subtitle);
              tempFilesRef.current.push(result.subtitle, ...result.fonts);
            } catch {
              // silently fail
            }
          }),
        );
      }
    };

    (async () => {
      await Promise.all([extractAudioBatch(), extractSubBatch()]);
      batchRunningRef.current = false;
      batchDoneRef.current = mediaPath;
    })();
  }, [mediaPath, audioStreams, extAudio, subtitleStreams, extSubs, selectedAudio, selectedSub, videoStarted]);

  // Listen for audio playback failure and fallback to transcode
  useEffect(() => {
    if (!mediaPath) return;

    const handler = () => {
      if (fallbackLock.current) return;
      fallbackLock.current = true;

      const cur = selectedAudio;
      showToast("Аудиокодек не поддерживается, перекодируем...", "info");
      handleAudio(cur, true);
    };

    window.addEventListener("audio-track-failed", handler);
    return () => {
      window.removeEventListener("audio-track-failed", handler);
      fallbackLock.current = false;
    };
  }, [mediaPath, selectedAudio, handleAudio]);

  // Listen for subtitle offset changes
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        path: string;
        offset: number;
      };
      if (detail.path === mediaPath) {
        setSubDelay(detail.offset);
        if (selectedSub !== SUB_OFF) loadSubtitle(selectedSub);
      }
    };
    window.addEventListener("suboffsetchange", handler);
    return () => window.removeEventListener("suboffsetchange", handler);
  }, [mediaPath, selectedSub, loadSubtitle]);

  // Drag-and-drop external tracks
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen<{ paths: string[] }>("tauri://drag-drop", (e) => {
        const audioExts = new Set([
          "mp3", "aac", "m4a", "mka", "ac3", "eac3", "dts", "truehd",
          "flac", "ogg", "opus", "wav", "wma",
        ]);
        const subExts = new Set([
          "srt", "ass", "ssa", "vtt", "sub", "idx", "sup", "pgs",
        ]);
        for (const p of e.payload.paths) {
          const ext = p.split(".").pop()?.toLowerCase() ?? "";
          if (audioExts.has(ext)) {
            const idx = extCounter.current--;
            const newTrack: VideoStreamInfo = {
              index: idx,
              codec_type: "audio",
              codec_name: ext,
              language: null,
              title: p.split(/[/\\]/).pop() ?? "Audio",
              is_default: false,
              is_forced: false,
              is_comment: false,
              bit_rate: null,
              channels: null,
              sample_rate: null,
              width: null,
              height: null,
              file_path: p,
            };
            setExtAudio((prev) => [...prev, newTrack]);
            handleAudio(idx);
            showToast("Аудиодорожка добавлена", "success");
          } else if (subExts.has(ext)) {
            const idx = extCounter.current--;
            const newTrack: VideoStreamInfo = {
              index: idx,
              codec_type: "subtitle",
              codec_name: ext,
              language: null,
              title: p.split(/[/\\]/).pop() ?? "Subtitles",
              is_default: false,
              is_forced: false,
              is_comment: false,
              bit_rate: null,
              channels: null,
              sample_rate: null,
              width: null,
              height: null,
              file_path: p,
            };
            setExtSubs((prev) => [...prev, newTrack]);
            handleSub(idx);
            showToast("Субтитры добавлены", "success");
          }
        }
      });
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, [handleAudio, handleSub]);

  // Cleanup on file switch / unmount
  useEffect(() => {
    return () => {
      batchRunningRef.current = false;
      batchDoneRef.current = null;
      if (subTrackElRef.current) subTrackElRef.current.remove();
      if (subBlobUrlRef.current) URL.revokeObjectURL(subBlobUrlRef.current);
      for (const p of tempFilesRef.current) {
        invoke("cleanup_temp_file", { path: p }).catch(() => {});
      }
      tempFilesRef.current = [];
      audioExtractCache.current.clear();
      audioExtracting.current.clear();
      subExtractCache.current.clear();
      setVideoStarted(false);
    };
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
        is_forced: false,
        is_comment: false,
        bit_rate: null,
        channels: null,
        sample_rate: null,
        width: null,
        height: null,
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
        is_forced: false,
        is_comment: false,
        bit_rate: null,
        channels: null,
        sample_rate: null,
        width: null,
        height: null,
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
            ? mergedAudio.map((s) => ({
                index: s.index,
                label: formatStreams(s),
              }))
            : [{ index: -1, label: "—" }]
        }
        selected={mergedAudio.length > 0 ? selectedAudio : -1}
        onChange={handleAudio}
        onAdd={handleAddAudio}
        isExtracting={isExtracting}
        extractElapsed={extractElapsed}
        progressPercent={extractProgress}
        statuses={Object.fromEntries(
          mergedAudio.map((s) => {
            const key = `${mediaPath}:${s.index}`;
            let status: "idle" | "extracting" | "cached" | "copy" = "idle";
            if (s.file_path) {
              status = "cached";
            } else if (isCopyCodec(s.codec_name)) {
              status = "copy";
            } else if (audioExtractCache.current.has(key)) {
              status = "cached";
            } else if (audioExtracting.current.has(key)) {
              status = "extracting";
            }
            return [s.index, status === "idle" ? undefined : status];
          }),
        )}
      />
      <TrackDropdown
        label="Сабы"
        tracks={[
          { index: SUB_OFF, label: "Нет" },
          ...(mergedSubs.length > 0
            ? mergedSubs.map((s) => ({ index: s.index, label: formatStreams(s) }))
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
