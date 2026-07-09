import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useState, useEffect, useMemo, useRef } from "react";
import Modal from "../modal.component";
import { Button } from "@/components/ui/button.component";
import { VideoStreamInfo } from "@/types/player";
import { formatStreams } from "@/lib/player.utils";
import { selectBestTrack } from "@/lib/track-preferences";
import { useSettingsStore } from "@/store/settings.store";
import { useMediaStore } from "@/store/media.store";

const SUB_OFF = -999;
const COPY_CODECS = new Set(["aac", "mp3", "flac", "opus", "vorbis"]);

function TrackSelectorModal({
  mediaPath,
  videoName,
  audioStreams,
  subtitleStreams,
  externalAudio,
  externalSubs,
  onConfirm,
  onCancel,
}: {
  mediaPath: string;
  videoName: string;
  audioStreams: VideoStreamInfo[];
  subtitleStreams: VideoStreamInfo[];
  externalAudio: VideoStreamInfo[];
  externalSubs: VideoStreamInfo[];
  onConfirm: (audioIdx: number, subIdx: number, audioPath?: string, subPath?: string, subFonts?: string[], subIsAss?: boolean) => void;
  onCancel: () => void;
}) {
  const [cacheStatuses, setCacheStatuses] = useState<Record<number, boolean>>({});
  const [extracting, setExtracting] = useState(false);
  const [selectedAudio, setSelectedAudio] = useState<number | null>(null);
  const [selectedSub, setSelectedSub] = useState<number>(SUB_OFF);
  const [byteProgress, setByteProgress] = useState<Record<string, number>>({});
  const progressRef = useRef<Record<string, number>>({});
  const progressIdRef = useRef<Record<string, number>>({});
  const closeTimerRef = useRef<number | null>(null);

  const mergedAudio = useMemo(
    () => [...audioStreams, ...externalAudio],
    [audioStreams, externalAudio],
  );
  const mergedSubs = useMemo(
    () => [...subtitleStreams, ...externalSubs],
    [subtitleStreams, externalSubs],
  );

  const mediaGet = useMediaStore((s) => s.getEntry);
  const mediaSetTrack = useMediaStore((s) => s.setTrack);
  const savedAudio = mediaGet(mediaPath)?.audioTrack;
  const savedSub = mediaGet(mediaPath)?.subtitleTrack;

  // Check cache statuses for both audio and subtitles
  useEffect(() => {
    const internalAudio = mergedAudio.filter((s) => !s.file_path);
    const internalSubs = mergedSubs.filter((s) => !s.file_path);

    Promise.all([
      internalAudio.length > 0
        ? invoke<boolean[]>("check_audio_caches", {
            path: mediaPath,
            streamIndices: internalAudio.map((s) => s.index),
          })
        : Promise.resolve([]),
      internalSubs.length > 0
        ? invoke<boolean[]>("check_subtitle_caches", {
            path: mediaPath,
            streamIndices: internalSubs.map((s) => s.index),
          })
        : Promise.resolve([]),
    ]).then(([audioResults, subResults]) => {
      const map: Record<number, boolean> = {};
      for (let i = 0; i < internalAudio.length; i++) {
        map[internalAudio[i].index] = audioResults[i];
      }
      for (let i = 0; i < internalSubs.length; i++) {
        map[internalSubs[i].index] = subResults[i];
      }
      setCacheStatuses(map);
    });
  }, [mediaPath, mergedAudio, mergedSubs]);

  // Cleanup close timer on unmount
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  // Poll progress from registry + sync RAF for smooth bar
  useEffect(() => {
    if (!extracting) return;
    let raf: number;

    const pollIds = () => {
      for (const [key, pid] of Object.entries(progressIdRef.current)) {
        invoke<number | null>("get_progress", { id: pid }).then((pct) => {
          if (pct !== null) {
            progressRef.current = { ...progressRef.current, [key]: pct };
          }
        }).catch(() => {});
      }
    };

    const tick = () => {
      setByteProgress({ ...progressRef.current });
      raf = requestAnimationFrame(tick);
    };

    // Quick-poll the registry every 400ms
    const pollTimer = setInterval(pollIds, 400);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(pollTimer);
    };
  }, [extracting]);

  // Auto-select defaults
  useEffect(() => {
    if (selectedAudio !== null) return;

    if (savedAudio !== undefined) {
      setSelectedAudio(savedAudio);
    } else {
      const prefs = useSettingsStore.getState();
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
      setSelectedAudio(
        best ?? mergedAudio.find((s) => !s.is_comment)?.index ?? -1,
      );
    }

    if (savedSub !== undefined) {
      setSelectedSub(savedSub);
    } else {
      const prefs = useSettingsStore.getState();
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
      setSelectedSub(best ?? SUB_OFF);
    }
  }, [mergedAudio, mergedSubs, savedAudio, savedSub, selectedAudio]);

  const isCached = (s: VideoStreamInfo) => {
    if (s.file_path) return true;
    return cacheStatuses[s.index] === true;
  };

  const needsExtraction = (s: VideoStreamInfo) => {
    if (s.file_path) return false;
    if (s.codec_type === "audio" && COPY_CODECS.has(s.codec_name.toLowerCase())) return false;
    return !isCached(s);
  };

  const canPlayNative = (codec: string): boolean => {
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
  };

  const trackedIndices = useMemo(() => {
    const indices: string[] = [];
    if (selectedAudio !== null) indices.push(String(selectedAudio));
    if (selectedSub !== SUB_OFF) indices.push(String(selectedSub));
    return indices;
  }, [selectedAudio, selectedSub]);

  const combinedProgress = useMemo(() => {
    if (trackedIndices.length === 0) return 0;
    let total = 0;
    let count = 0;
    for (const idx of trackedIndices) {
      const p = byteProgress[idx];
      if (p !== undefined) {
        total += p;
        count++;
      }
    }
    if (count === 0) return 0;
    return Math.min(100, total / count);
  }, [byteProgress, trackedIndices]);

  const handleConfirm = async () => {
    if (selectedAudio === null) return;
    setExtracting(true);
    setByteProgress({});

    const unlisten = await listen<{ streamIndex: number; progress: number }>(
      "extract-progress",
      (event) => {
        progressRef.current = {
          ...progressRef.current,
          [String(event.payload.streamIndex)]: event.payload.progress,
        };
      },
    );

    const tasks: Promise<void>[] = [];

    // Audio task
    const audioStream = mergedAudio.find((s) => s.index === selectedAudio);
    let audioPathResult: string | undefined;
    if (audioStream && !audioStream.file_path && needsExtraction(audioStream)) {
      const shouldTranscode = !canPlayNative(audioStream.codec_name);
      tasks.push(
        (async () => {
          try {
            const result = await invoke<{ path: string; progressId: number }>("extract_audio_track", {
              path: mediaPath,
              streamIndex: selectedAudio,
              codecName: audioStream.codec_name,
              forceTranscode: shouldTranscode,
            });
            audioPathResult = result.path;
            progressIdRef.current[String(selectedAudio)] = result.progressId;
          } catch {
            if (!shouldTranscode) {
              try {
                const result = await invoke<{ path: string; progressId: number }>("extract_audio_track", {
                  path: mediaPath,
                  streamIndex: selectedAudio,
                  codecName: audioStream.codec_name,
                  forceTranscode: true,
                });
                audioPathResult = result.path;
                progressIdRef.current[String(selectedAudio)] = result.progressId;
              } catch {}
            }
          }
        })(),
      );
    } else if (audioStream) {
      setByteProgress((prev) => ({ ...prev, [String(selectedAudio)]: 100 }));
    }

    // Subtitle task
    let subPathResult: string | undefined;
    let subFontsResult: string[] | undefined;
    let subIsAss = false;
    if (selectedSub !== SUB_OFF) {
      const subStream = mergedSubs.find((s) => s.index === selectedSub);
      if (subStream && !subStream.file_path) {
        subIsAss = subStream.codec_name.toLowerCase() === "ass" || subStream.codec_name.toLowerCase() === "ssa";
        tasks.push(
          (async () => {
            try {
              const result = await invoke<{ subtitle: string; fonts: string[]; progressId: number }>(
                "extract_video_subtitle",
                {
                  path: mediaPath,
                  streamIndex: selectedSub,
                  codecName: subStream.codec_name,
                },
              );
              subPathResult = result.subtitle;
              subFontsResult = result.fonts;
              progressIdRef.current[String(selectedSub)] = result.progressId;
            } catch {}
          })(),
        );
      } else if (subStream?.file_path) {
        subPathResult = subStream.file_path ?? undefined;
        subFontsResult = [];
        subIsAss = subStream.codec_name.toLowerCase() === "ass" || subStream.codec_name.toLowerCase() === "ssa";
        setByteProgress((prev) => ({ ...prev, [String(selectedSub)]: 100 }));
      }
    }

    // Wait for all tasks to complete
    await Promise.all(tasks);

    unlisten();

    setByteProgress((prev) => {
      const next = { ...prev };
      for (const idx of trackedIndices) {
        next[idx] = 100;
      }
      return next;
    });

    mediaSetTrack(mediaPath, "audio", selectedAudio);
    mediaSetTrack(mediaPath, "sub", selectedSub);

    await new Promise<void>((resolve) => {
      closeTimerRef.current = window.setTimeout(resolve, 500);
    });

    setExtracting(false);
    onConfirm(selectedAudio, selectedSub, audioPathResult, subPathResult, subFontsResult, subIsAss ? true : undefined);
  };

  return (
    <Modal
      header={`Выбор дорожек — ${videoName}`}
      onClose={onCancel}
      className="w-md"
    >
      <section className="flex flex-col gap-2">
        {/* Audio tracks */}
        <div className="flex flex-col gap-0.5">
          <span className="windows95-text text-[10px] font-bold">
            Аудиодорожка
          </span>
          <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto windows95-border bg-white p-0.5">
            {mergedAudio.map((s) => {
              const extStatus = isCached(s)
                ? "cached"
                : needsExtraction(s)
                  ? "transcode"
                  : "copy";
              return (
                <button
                  key={s.index}
                  className={`flex items-center gap-1 w-full text-left px-1 py-0.5 text-[10px] windows95-text hover:bg-secondary hover:text-white whitespace-nowrap hover:cursor-pointer ${
                    s.index === selectedAudio
                      ? "bg-secondary text-white"
                      : "bg-white"
                  }`}
                  onClick={() => setSelectedAudio(s.index)}
                >
                  <span className="truncate flex-1">
                    {formatStreams(s)}
                  </span>
                  {extStatus === "copy" && (
                    <span className="text-[8px] text-green-600 shrink-0">
                      COPY
                    </span>
                  )}
                  {extStatus === "cached" && (
                    <span className="text-[8px] text-blue-600 shrink-0">
                      CACHE
                    </span>
                  )}
                  {extStatus === "transcode" && (
                    <span className="text-[8px] text-amber-500 shrink-0">
                      ENCODE
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Subtitle tracks */}
        <div className="flex flex-col gap-0.5">
          <span className="windows95-text text-[10px] font-bold">
            Субтитры
          </span>
          <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto windows95-border bg-white p-0.5">
            {[{ index: SUB_OFF, label: "Нет" }].concat(
              mergedSubs.map((s) => ({ index: s.index, label: formatStreams(s) })),
            ).map((t) => (
              <button
                key={t.index}
                className={`flex items-center gap-1 w-full text-left px-1 py-0.5 text-[10px] windows95-text hover:bg-secondary hover:text-white whitespace-nowrap hover:cursor-pointer ${
                  t.index === selectedSub
                    ? "bg-secondary text-white"
                    : "bg-white"
                }`}
                onClick={() => setSelectedSub(t.index)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Progress bar */}
        {extracting && trackedIndices.length > 0 && (
          <div className="flex flex-col gap-0.5 mt-1">
            <div className="flex items-center gap-1">
              <div className="flex-1 windows95-border bg-white h-3">
                <div
                  className="h-full bg-highlight transition-none"
                  style={{ width: `${Math.round(combinedProgress)}%` }}
                />
              </div>
              <span className="text-[10px] windows95-text shrink-0 w-8 text-right">
                {Math.round(combinedProgress)}%
              </span>
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="flex justify-end gap-1 mt-1">
          <Button onClick={handleConfirm} disabled={extracting || selectedAudio === null}>
            {extracting
              ? "Извлечение аудио..."
              : "Начать просмотр"}
          </Button>
          <Button onClick={onCancel}>Отмена</Button>
        </div>
      </section>
    </Modal>
  );
}

export default TrackSelectorModal;
