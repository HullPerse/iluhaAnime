import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Wand2, Ban, Check, Loader, ListVideo } from "lucide-react";
import Modal from "@/components/shared/modal.component";
import ProgressBar from "@/components/shared/progress.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import Select from "@/components/ui/select.component";
import Tabs from "@/components/shared/tabs.component";
import FFMPEG from "./ffmpeg.player";
import ShaderPicker from "./shader.player";
import {
  useUpscaleQueueStore,
  type UpscaleConfig,
  type ConvertConfig,
} from "@/store/upscale.store";

interface Props {
  filePath: string;
  onDone?: (outputPath: string) => void;
  exists?: boolean;
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

const ANIME4K_PRESETS: {
  label: string;
  value: string;
  shaders: string[];
  quality: string;
  gpuBackend: string;
}[] = [
  {
    label: "⚡ Молниеносный",
    value: "lightning",
    shaders: ["clamp", "upscale_cnn_x2_s"],
    quality: "ultrafast",
    gpuBackend: "gpu",
  },
  {
    label: "🚀 Быстрый",
    value: "fast",
    shaders: ["clamp", "restore_cnn_ul", "upscale_cnn_x2_ul"],
    quality: "fast",
    gpuBackend: "gpu",
  },
  {
    label: "⚖️ Сбалансированный",
    value: "balanced",
    shaders: ["clamp", "restore_cnn_l", "upscale_cnn_x2_l", "thin_fast"],
    quality: "slow",
    gpuBackend: "cpu",
  },
  {
    label: "✨ Качественный",
    value: "quality",
    shaders: [
      "clamp",
      "denoise_bilateral_mean",
      "restore_cnn_soft_vl",
      "upscale_denoise_cnn_x2_vl",
      "thin_hq",
    ],
    quality: "slow",
    gpuBackend: "cpu",
  },
  {
    label: "👑 Максимальный",
    value: "maximum",
    shaders: [
      "clamp",
      "denoise_bilateral_median",
      "deblur_dog",
      "restore_cnn_soft_vl",
      "upscale_denoise_cnn_x2_vl",
      "thin_hq",
      "darken_hq",
    ],
    quality: "veryslow",
    gpuBackend: "cpu",
  },
  {
    label: "🌫 С шумоподавлением",
    value: "denoise",
    shaders: [
      "clamp",
      "denoise_bilateral_median",
      "restore_cnn_ul",
      "upscale_denoise_cnn_x2_ul",
    ],
    quality: "slow",
    gpuBackend: "cpu",
  },
  {
    label: "🖼 Для чистого аниме",
    value: "clean",
    shaders: ["clamp", "restore_cnn_m", "upscale_cnn_x2_m", "thin_fast"],
    quality: "fast",
    gpuBackend: "cpu",
  },
  {
    label: "📀 Ретро (DVD)",
    value: "retro",
    shaders: [
      "clamp",
      "denoise_bilateral_mean",
      "deblur_dog",
      "restore_cnn_soft_vl",
      "upscale_denoise_cnn_x2_vl",
    ],
    quality: "slow",
    gpuBackend: "cpu",
  },
];

const FORMAT_OPTIONS = [
  { label: "MP4 (H.264)", value: "mp4" },
  { label: "MKV", value: "mkv" },
  { label: "AVI", value: "avi" },
  { label: "MOV", value: "mov" },
  { label: "WebM", value: "webm" },
  { label: "M4V", value: "m4v" },
  { label: "TS", value: "ts" },
];

const TABS = [
  { id: "upscale" as const, label: "Апскейл" },
  { id: "convert" as const, label: "Конвертация" },
];

function fileNameFromPath(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || p;
}

function formatETA(secs: number): string {
  if (!Number.isFinite(secs)) return "";
  if (secs <= 0) return "< 1 мин";
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  if (m > 0) return `${m} мин ${s} сек`;
  return `${s} сек`;
}

export default function UpscalePlayer({
  filePath,
  onDone,
  exists = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"upscale" | "convert">("upscale");
  const [resolution, setResolution] = useState("original");
  const [fpsValue, setFpsValue] = useState("");
  const [quality, setQuality] = useState("ultrafast");
  const [gpuBackend, setGpuBackend] = useState("cpu");
  const [availableGpu, setAvailableGpu] = useState<string[]>(["cpu"]);
  const [upscaler, setUpscaler] = useState("ffmpeg");
  const [ffmpegStatus, setFfmpegStatus] = useState<
    "checking" | "ok" | "missing" | "downloading"
  >("checking");
  const [anime4kPreset, setAnime4kPreset] = useState("lightning");
  const [selectedShaders, setSelectedShaders] = useState<string[]>([]);
  const [targetFormat, setTargetFormat] = useState("mp4");
  const [copyStreams, setCopyStreams] = useState(true);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const activeItem = useUpscaleQueueStore((s) =>
    activeItemId ? (s.items.find((i) => i.id === activeItemId) ?? null) : null,
  );

  const isInQueue = useUpscaleQueueStore((s) =>
    s.items.some(
      (i) =>
        i.filePath === filePath &&
        (i.status === "queued" || i.status === "processing"),
    ),
  );

  const { data: upscaleConfig } = useQuery({
    queryKey: ["upscale_config"],
    queryFn: async () => {
      const [ffmpegOk, gpuEncoders, defaultShaders] = await Promise.all([
        invoke<boolean>("check_ffprobe").catch(() => false),
        invoke<string[]>("check_gpu_encoders").catch(() => ["cpu"]),
        invoke<string[]>("default_anime4k_shaders").catch(() => []),
      ]);
      return { ffmpegOk, gpuEncoders, defaultShaders };
    },
    enabled: open,
    staleTime: Infinity,
  });

  const handlePresetChange = useCallback(
    (preset: string) => {
      const data = ANIME4K_PRESETS.find((p) => p.value === preset);
      if (!data) return;
      setAnime4kPreset(preset);
      setQuality(data.quality);
      setSelectedShaders(data.shaders);
      if (data.gpuBackend === "gpu") {
        setGpuBackend((prev) => {
          if (prev !== "cpu") return prev;
          return availableGpu.find((b) => b !== "cpu") || "cpu";
        });
      } else {
        setGpuBackend("cpu");
      }
    },
    [availableGpu],
  );

  useEffect(() => {
    if (!upscaleConfig) return;
    setFfmpegStatus(upscaleConfig.ffmpegOk ? "ok" : "missing");
    setAvailableGpu(upscaleConfig.gpuEncoders);
    setSelectedShaders(upscaleConfig.defaultShaders);
    const backends = upscaleConfig.gpuEncoders;
    if (backends.length > 0 && backends[0] === "cpu") {
      setGpuBackend(backends.length > 1 ? backends[1] : "cpu");
    }
  }, [upscaleConfig]);

  useEffect(() => {
    if (upscaler === "anime4k") {
      handlePresetChange(anime4kPreset);
    }
  }, [upscaler, availableGpu]);

  useEffect(() => {
    if (activeItem?.status === "done") {
      onDone?.(activeItem.outputPath);
    }
  }, [activeItem?.status, activeItem?.outputPath, onDone]);

  const resetState = useCallback(() => {
    setActiveItemId(null);
    setLocalError(null);
  }, []);

  const startUpscale = useCallback(() => {
    const noop = resolution === "original" && !fpsValue;
    if (noop) {
      setLocalError("Выберите другое разрешение или FPS");
      return;
    }

    setLocalError(null);

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
    const id = useUpscaleQueueStore
      .getState()
      .addUpscaleItem(filePath, fileNameFromPath(filePath), config);
    setActiveItemId(id);
  }, [
    filePath,
    resolution,
    fpsValue,
    quality,
    gpuBackend,
    upscaler,
    selectedShaders,
  ]);

  const startConvert = useCallback(() => {
    setLocalError(null);

    const config: ConvertConfig = {
      targetFormat,
      copyStreams,
    };
    const id = useUpscaleQueueStore
      .getState()
      .addConvertItem(filePath, fileNameFromPath(filePath), config);
    setActiveItemId(id);
  }, [filePath, targetFormat, copyStreams]);

  const handleCancel = useCallback(async () => {
    await invoke("cancel_upscale");
  }, []);

  const handleAddToQueue = useCallback(() => {
    if (activeTab === "upscale") {
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
        .addUpscaleItem(filePath, fileNameFromPath(filePath), config);
    } else {
      const config: ConvertConfig = {
        targetFormat,
        copyStreams,
      };
      useUpscaleQueueStore
        .getState()
        .addConvertItem(filePath, fileNameFromPath(filePath), config);
    }
    setOpen(false);
    resetState();
  }, [
    activeTab,
    filePath,
    resolution,
    fpsValue,
    quality,
    gpuBackend,
    upscaler,
    selectedShaders,
    targetFormat,
    copyStreams,
    resetState,
  ]);

  const handleClose = useCallback(() => {
    if (activeItem?.status === "processing") return;
    setOpen(false);
    resetState();
  }, [activeItem?.status, resetState]);

  const showConfig = !activeItemId;
  const showProgress =
    activeItem &&
    (activeItem.status === "queued" || activeItem.status === "processing");
  const showDone = activeItem?.status === "done";
  const showLocalError = localError && !activeItemId;
  const showItemError = activeItem?.status === "error";
  const stage =
    activeItem?.current != null &&
    activeItem?.total != null &&
    activeItem.total > 0
      ? "encoding"
      : activeItem?.status === "processing"
        ? "initializing"
        : null;
  const etaSecs =
    activeItem &&
    activeItem.speed &&
    activeItem.speed > 0 &&
    activeItem.current != null &&
    activeItem.total != null
      ? (activeItem.total - activeItem.current) / activeItem.speed
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
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title={isInQueue ? "Уже в очереди" : "Улучшить качество (апскейл)"}
        disabled={!exists || isInQueue}
      >
        <Wand2 className="size-3" />
      </Button>

      {open && (
        <Modal
          header={`${activeTab === "upscale" ? "Апскейл" : "Конвертация"}: ${fileNameFromPath(filePath)}`}
          onClose={handleClose}
          className="min-w-xl"
        >
          {showConfig && (
            <div className="flex flex-col">
              <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

              <section className="flex-1 overflow-hidden p-1 windows95-border">
                {activeTab === "upscale" ? (
                  <div className="flex flex-col gap-2 pt-2">
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
                      <FFMPEG
                        status={ffmpegStatus}
                        setStatus={setFfmpegStatus}
                      />
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
                        <label className="windows95-text text-xs">
                          Качество
                        </label>
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
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 pt-2">
                    <label className="windows95-text text-xs">
                      Целевой формат
                    </label>
                    <Select
                      value={targetFormat}
                      onChange={setTargetFormat}
                      options={FORMAT_OPTIONS}
                    />

                    <label className="flex items-center gap-2 windows95-text text-xs cursor-pointer select-none">
                      <Checkbox
                        checked={copyStreams}
                        onChange={setCopyStreams}
                      />
                      <span>Копировать потоки (быстро)</span>
                    </label>

                    {!copyStreams && (
                      <span className="windows95-text text-[10px] text-muted">
                        Будет выполнено перекодирование в H.264 + AAC
                      </span>
                    )}
                  </div>
                )}
              </section>

              <div className="flex flex-row gap-1 mt-2 justify-end">
                <Button onClick={handleClose}>Отмена</Button>
                <Button onClick={handleAddToQueue}>В очередь</Button>
                <Button
                  onClick={
                    activeTab === "upscale" ? startUpscale : startConvert
                  }
                >
                  {activeTab === "upscale" ? "Запустить" : "Конвертировать"}
                </Button>
              </div>
            </div>
          )}

          {showProgress && (
            <div className="flex flex-col gap-2 p-1 min-w-xl">
              {activeItem?.status === "queued" && (
                <div className="flex flex-col items-center gap-2 py-4">
                  <ListVideo className="size-5 text-muted" />
                  <span className="windows95-text text-xs">В очереди...</span>
                </div>
              )}

              {activeItem?.status === "processing" &&
                stage === "initializing" && (
                  <div className="flex flex-col items-center gap-2 py-4">
                    <Loader className="size-5 animate-spin" />
                    <span className="windows95-text text-xs">
                      Инициализация...
                    </span>
                  </div>
                )}

              {stage === "encoding" && (
                <>
                  <ProgressBar
                    value={activeItem?.current ?? 0}
                    max={activeItem?.total ?? 1}
                  />
                  <span className="windows95-text text-xs text-center">
                    {activeItem?.progress ?? 0}%
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

          {showLocalError && (
            <div className="flex flex-col gap-2 p-1 items-center">
              <span className="text-destructive windows95-text text-xs text-center">
                {localError}
              </span>
              <Button onClick={handleClose}>Закрыть</Button>
            </div>
          )}

          {showItemError && (
            <div className="flex flex-col gap-2 p-1 items-center">
              <span className="text-destructive windows95-text text-xs text-center">
                {activeItem?.error ?? "Ошибка"}
              </span>
              <Button onClick={handleClose}>Закрыть</Button>
            </div>
          )}

          {showDone && (
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
