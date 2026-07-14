import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Wand2, Ban, Check, Loader } from "lucide-react";
import Modal from "@/components/shared/modal.component";
import ProgressBar from "@/components/shared/progress.component";
import { Button } from "@/components/ui/button.component";
import Select from "@/components/ui/select.component";
import FFMPEG from "./ffmpeg.player";
import ShaderPicker from "./shader.player";
import {
  useUpscaleQueueStore,
  type UpscaleConfig,
} from "@/store/upscale.store";

type UpscaleProgressPayload = {
  current: number;
  total: number;
  stage: string;
  speed: number;
};

interface Props {
  filePath: string;
  onDone?: (outputPath: string) => void;
}

const GPU_LABELS: Record<string, string> = {
  cpu: "CPU (x264)",
  nvenc: "NVIDIA NVENC",
  amf: "AMD AMF",
  qsv: "Intel QSV",
};

const RESOLUTIONS = [
  { label: "Оригинальное", value: "original" },
  { label: "1920\u00d71080 (1080p)", value: "1920x1080" },
  { label: "2560\u00d71440 (2K)", value: "2560x1440" },
  { label: "3840\u00d72160 (4K)", value: "3840x2160" },
];

const FPS_OPTIONS = [
  { label: "Оригинальный", value: "" },
  { label: "30", value: "30" },
  { label: "60 (дублирование)", value: "60" },
  { label: "60 (интерполяция)", value: "60i" },
];

const QUALITY_OPTIONS = [
  { label: "Самый быстрый", value: "ultrafast" },
  { label: "Быстрый", value: "fast" },
  { label: "Медленный", value: "slow" },
  { label: "Самый медленный", value: "veryslow" },
];

const UPSCALER_OPTIONS = [
  { label: "Lanczos (ffmpeg)", value: "ffmpeg" },
  { label: "Anime4K (GPU шейдеры)", value: "anime4k" },
];

const ANIME4K_PRESETS = [
  { label: "Быстрый GPU", value: "fast-gpu" },
  { label: "Баланс", value: "balanced" },
  { label: "Максимальное качество", value: "quality" },
];

function fileNameFromPath(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || p;
}

function buildOutputPath(inputPath: string): string {
  const dot = inputPath.lastIndexOf(".");
  return dot > 0
    ? inputPath.slice(0, dot) + "_upscaled.mkv"
    : inputPath + "_upscaled.mkv";
}

function formatETA(secs: number): string {
  if (!Number.isFinite(secs)) return "";
  if (secs <= 0) return "< 1 мин";
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  if (m > 0) return `${m} мин ${s} сек`;
  return `${s} сек`;
}

export default function UpscalePlayer({ filePath, onDone }: Props) {
  const [open, setOpen] = useState(false);
  const [resolution, setResolution] = useState("original");
  const [fpsValue, setFpsValue] = useState("");
  const [quality, setQuality] = useState("ultrafast");
  const [gpuBackend, setGpuBackend] = useState("cpu");
  const [availableGpu, setAvailableGpu] = useState<string[]>(["cpu"]);
  const [upscaler, setUpscaler] = useState("ffmpeg");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<UpscaleProgressPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [ffmpegStatus, setFfmpegStatus] = useState<
    "checking" | "ok" | "missing" | "downloading"
  >("checking");
  const [anime4kPreset, setAnime4kPreset] = useState("fast-gpu");
  const [selectedShaders, setSelectedShaders] = useState<string[]>([]);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const outputPathRef = useRef("");

  const handlePresetChange = useCallback(
    (preset: string) => {
      setAnime4kPreset(preset);
      if (preset === "fast-gpu") {
        setQuality("fast");
        setGpuBackend((prev) => {
          if (prev !== "cpu") return prev;
          return availableGpu.find((b) => b !== "cpu") || "cpu";
        });
      } else if (preset === "balanced") {
        setQuality("slow");
        setGpuBackend("cpu");
      } else {
        setQuality("veryslow");
        setGpuBackend("cpu");
      }
    },
    [availableGpu],
  );

  useEffect(() => {
    return () => {
      unlistenRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    invoke<boolean>("check_ffprobe")
      .then((ok) => setFfmpegStatus(ok ? "ok" : "missing"))
      .catch(() => setFfmpegStatus("missing"));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    invoke<string[]>("check_gpu_encoders").then((backends) => {
      setAvailableGpu(backends);
      if (backends.length > 0 && backends[0] === "cpu") {
        setGpuBackend(backends.length > 1 ? backends[1] : "cpu");
      }
    });
  }, [open]);

  // Apply Anime4K preset when upscaler or available GPU list changes
  useEffect(() => {
    if (upscaler === "anime4k") {
      handlePresetChange(anime4kPreset);
    }
  }, [upscaler, availableGpu]);

  // Fetch default shader selection when modal opens
  useEffect(() => {
    if (!open) return;
    invoke<string[]>("default_anime4k_shaders")
      .then(setSelectedShaders)
      .catch(() => setSelectedShaders([]));
  }, [open]);

  const resetState = useCallback(() => {
    setRunning(false);
    setProgress(null);
    setError(null);
    setDone(false);
  }, []);

  const startUpscale = useCallback(async () => {
    const noop = resolution === "original" && !fpsValue;
    if (noop) {
      setError("Выберите другое разрешение или FPS");
      return;
    }

    setError(null);
    setDone(false);
    setRunning(true);
    setProgress(null);

    const outputPath = buildOutputPath(filePath);
    outputPathRef.current = outputPath;
    const [w, h] =
      resolution === "original" ? [0, 0] : resolution.split("x").map(Number);
    const interpolate = fpsValue === "60i";
    const fps =
      fpsValue === "60" || fpsValue === "60i"
        ? 60
        : fpsValue
          ? Number(fpsValue)
          : null;

    const unlisten = await listen<UpscaleProgressPayload>(
      "upscale-progress",
      (e) => {
        const p = e.payload;
        setProgress(p);
        if (p.stage === "done" || (p.current >= p.total && p.total > 0)) {
          setDone(true);
          setRunning(false);
          unlistenRef.current = null;
          unlisten();
          onDone?.(outputPathRef.current);
        }
      },
    );
    unlistenRef.current = unlisten;

    const aiUpscalerParam = upscaler !== "ffmpeg" ? upscaler : null;
    try {
      await invoke<{ path: string; progressId: number }>("upscale_video", {
        inputPath: filePath,
        outputPath,
        width: w,
        height: h,
        targetFps: fps,
        interpolate,
        quality,
        gpuBackend,
        aiUpscaler: aiUpscalerParam,
        selectedShaders: upscaler === "anime4k" ? selectedShaders : undefined,
      });
    } catch (e: unknown) {
      setError(typeof e === "string" ? e : "Ошибка");
      setRunning(false);
    }
  }, [
    filePath,
    resolution,
    fpsValue,
    quality,
    gpuBackend,
    upscaler,
    selectedShaders,
  ]);

  const handleCancel = useCallback(async () => {
    await invoke("cancel_upscale");
    setRunning(false);
    unlistenRef.current?.();
    unlistenRef.current = null;
  }, []);

  const handleAddToQueue = useCallback(() => {
    const [w, h] =
      resolution === "original" ? [0, 0] : resolution.split("x").map(Number);
    const interpolate = fpsValue === "60i";
    const fps =
      fpsValue === "60" || fpsValue === "60i"
        ? 60
        : fpsValue
          ? Number(fpsValue)
          : null;
    const config: UpscaleConfig = {
      width: w,
      height: h,
      targetFps: fps,
      interpolate,
      quality,
      gpuBackend,
      aiUpscaler: upscaler !== "ffmpeg" ? upscaler : null,
      selectedShaders: upscaler === "anime4k" ? selectedShaders : undefined,
    };
    useUpscaleQueueStore
      .getState()
      .addItem(filePath, fileNameFromPath(filePath), config);
    setOpen(false);
    resetState();
  }, [
    filePath,
    resolution,
    fpsValue,
    quality,
    gpuBackend,
    upscaler,
    selectedShaders,
    resetState,
  ]);

  const handleClose = useCallback(() => {
    if (running) return;
    setOpen(false);
    resetState();
  }, [running, resetState]);

  const showConfig = !running && !done && !error;
  const showProgress = running || (progress && !done && !error);
  const stage = progress?.stage;
  const initializing = stage === "initializing" || (!progress && running);
  const started = stage === "started";
  const etaSecs =
    progress && progress.speed > 0
      ? (progress.total - progress.current) / progress.speed
      : null;

  const gpuOptions = availableGpu.map((b) => ({
    value: b,
    label: GPU_LABELS[b] || b,
  }));

  return (
    <>
      <Button
        size="icon"
        className="h-4 w-4"
        onClick={() => setOpen(true)}
        title="Улучшить качество (апскейл)"
      >
        <Wand2 className="size-3" />
      </Button>

      {open && (
        <Modal
          header={`Апскейл: ${fileNameFromPath(filePath)}`}
          onClose={handleClose}
          className="min-w-xl"
        >
          {showConfig && (
            <div className="flex flex-col gap-2 p-1">
              <label className="windows95-text text-xs">Разрешение</label>
              <Select
                value={resolution}
                onChange={setResolution}
                options={RESOLUTIONS}
              />

              <label className="windows95-text text-xs">Апскейлер</label>
              <Select
                value={upscaler}
                onChange={setUpscaler}
                options={UPSCALER_OPTIONS}
              />
              {upscaler === "ffmpeg" && (
                <FFMPEG status={ffmpegStatus} setStatus={setFfmpegStatus} />
              )}

              {upscaler === "anime4k" && (
                <span className="windows95-text text-xs">
                  Требуется GTX 970+ (Vulkan)
                </span>
              )}

              <label className="windows95-text text-xs">FPS</label>
              <Select
                value={fpsValue}
                onChange={setFpsValue}
                options={FPS_OPTIONS}
              />

              {upscaler === "anime4k" ? (
                <>
                  <label className="windows95-text text-xs">
                    Режим Anime4K
                  </label>
                  <Select
                    value={anime4kPreset}
                    onChange={handlePresetChange}
                    options={ANIME4K_PRESETS}
                  />
                  <ShaderPicker
                    value={selectedShaders}
                    onChange={setSelectedShaders}
                    gpuBackend={gpuBackend}
                  />
                </>
              ) : (
                <>
                  <label className="windows95-text text-xs">Качество</label>
                  <Select
                    value={quality}
                    onChange={setQuality}
                    options={QUALITY_OPTIONS}
                  />

                  {gpuOptions.length > 1 && (
                    <>
                      <label className="windows95-text text-xs">
                        Кодек / Ускоритель
                      </label>
                      <Select
                        value={gpuBackend}
                        onChange={setGpuBackend}
                        options={gpuOptions}
                      />
                    </>
                  )}
                </>
              )}

              <div className="flex flex-row gap-1 mt-2 justify-end">
                <Button onClick={handleClose}>Отмена</Button>
                <Button onClick={handleAddToQueue}>В очередь</Button>
                <Button onClick={startUpscale}>Запустить</Button>
              </div>
            </div>
          )}

          {showProgress && (
            <div className="flex flex-col gap-2 p-1 min-w-xl">
              {(initializing || stage === "initializing") && (
                <div className="flex flex-col items-center gap-2 py-4">
                  <Loader className="size-5 animate-spin" />
                  <span className="windows95-text text-xs">
                    Инициализация...
                  </span>
                </div>
              )}

              {started && !initializing && (
                <div className="flex flex-col items-center gap-2 py-4">
                  <Loader className="size-5 animate-spin" />
                  <span className="windows95-text text-xs">Запуск...</span>
                </div>
              )}

              {stage === "encoding" && (
                <>
                  <ProgressBar
                    value={progress?.current ?? 0}
                    max={progress?.total ?? 1}
                  />
                  <span className="windows95-text text-xs text-center">
                    {progress?.total
                      ? `${Math.round((progress.current / progress.total) * 100)}%`
                      : ""}
                  </span>
                  {etaSecs != null && (
                    <span className="windows95-text text-xs text-center text-muted">
                      Осталось: {formatETA(etaSecs)}
                    </span>
                  )}
                </>
              )}

              <div className="flex flex-row gap-1 mt-1 justify-center">
                <Button variant="destructive" onClick={handleCancel}>
                  <Ban className="size-3" />
                  Отменить
                </Button>
              </div>
            </div>
          )}

          {error && !running && (
            <div className="flex flex-col gap-2 p-1 items-center">
              <span className="text-destructive windows95-text text-xs text-center">
                {error}
              </span>
              <Button onClick={handleClose}>Закрыть</Button>
            </div>
          )}

          {done && !error && (
            <div className="flex flex-col gap-2 p-1 items-center">
              <Check className="size-6 text-success" />
              <span className="windows95-text text-xs">Готово!</span>
              <Button onClick={handleClose}>Закрыть</Button>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
