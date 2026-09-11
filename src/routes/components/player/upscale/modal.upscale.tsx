import { useQuery } from "@tanstack/react-query";
import { Wand2 } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";

import Modal from "@/components/shared/modal.component";
import Tabs from "@/components/shared/tabs.component";
import { Button } from "@/components/ui/button.component";
import { GPU_LABELS, TABS } from "@/config/player/options.config";
import { ANIME4K_PRESETS } from "@/config/player/presets.config";
import { useI18n } from "@/lib/locale/i18n.utils";
import { fileNameFromPath } from "@/lib/player/title.utils";
import { withFallback } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useUpscaleQueueStore } from "@/store/upscale.store";
import type { UpscaleConfig, ConvertConfig } from "@/types/upscale";

import { UpscaleConfigPanel } from "./config.upscale";
import { UpscaleProgressPanel } from "./progress.upscale";
import { UpscaleStatusPanels } from "./status.upscale";

export default function UpscalePlayer({
  filePath,
  onDone,
  exists = true,
}: {
  filePath: string;
  onDone?: (outputPath: string) => void;
  exists?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"upscale" | "convert">("upscale");
  const [resolution, setResolution] = useState("original");
  const [fpsValue, setFpsValue] = useState("");
  const [quality, setQuality] = useState("ultrafast");
  const [videoCodec, setVideoCodec] = useState("h264");
  const [gpuBackend, setGpuBackend] = useState("cpu");
  const [availableGpu, setAvailableGpu] = useState<string[]>(["cpu"]);
  const [upscaler, setUpscaler] = useState("ffmpeg");
  const [ffmpegStatus, setFfmpegStatus] = useState<"checking" | "ok" | "missing" | "downloading">(
    "checking"
  );
  const [anime4kPreset, setAnime4kPreset] = useState("lightning");
  const [selectedShaders, setSelectedShaders] = useState<string[]>([]);
  const [temporalDenoise, setTemporalDenoise] = useState(false);
  const [targetFormat, setTargetFormat] = useState("mp4");
  const [copyStreams, setCopyStreams] = useState(true);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const { t } = useI18n();

  const activeItem = useUpscaleQueueStore((s) =>
    activeItemId ? (s.items.find((i) => i.id === activeItemId) ?? null) : null
  );

  const isInQueue = useUpscaleQueueStore((s) =>
    s.items.some(
      (i) => i.filePath === filePath && (i.status === "queued" || i.status === "processing")
    )
  );

  const { data: upscaleConfig } = useQuery({
    queryKey: ["upscale_config"],
    queryFn: async () => {
      const [ffmpegOk, gpuEncoders, defaultShaders] = await Promise.all([
        withFallback(invokeTyped<boolean>("check_ffprobe"), false),
        withFallback(invokeTyped<string[]>("check_gpu_encoders"), ["cpu"]),
        withFallback(invokeTyped<string[]>("default_anime4k_shaders"), []),
      ]);
      return { ffmpegOk, gpuEncoders, defaultShaders };
    },
    enabled: open,
    staleTime: Infinity,
  });
  const { data: suggestion } = useQuery({
    queryKey: ["upscale_suggest", filePath],
    queryFn: () =>
      withFallback(
        invokeTyped<{ preset: string; reason: string }>("suggest_upscale_preset", {
          inputPath: filePath,
        }),
        null
      ),
    enabled: open,
    staleTime: Infinity,
  });

  const touchedPreset = useRef(false);

  const applyPresetData = useCallback(
    (data: (typeof ANIME4K_PRESETS)[number]) => {
      setAnime4kPreset(data.value);
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
    [availableGpu]
  );

  const handlePresetChange = useCallback(
    (preset: string) => {
      touchedPreset.current = true;
      const data = ANIME4K_PRESETS.find((p) => p.value === preset);
      if (data) applyPresetData(data);
    },
    [applyPresetData]
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
    if (upscaler !== "anime4k") return;
    const wanted = !touchedPreset.current && suggestion ? suggestion.preset : anime4kPreset;
    const data = ANIME4K_PRESETS.find((p) => p.value === wanted);
    if (data) applyPresetData(data);
  }, [upscaler, anime4kPreset, suggestion, applyPresetData]);

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
      setLocalError(t("player.upscale.select.resolution"));
      return;
    }

    setLocalError(null);

    const [w, h] = resolution === "original" ? [0, 0] : resolution.split("x").map(Number);
    const interpolate = fpsValue === "60i";
    const fps = fpsValue === "60" || fpsValue === "60i" ? 60 : fpsValue ? Number(fpsValue) : null;
    const config: UpscaleConfig = {
      width: w,
      height: h,
      targetFps: fps,
      interpolate,
      quality,
      gpuBackend,
      videoCodec,
      aiUpscaler: upscaler === "ffmpeg" ? null : upscaler,
      selectedShaders: upscaler === "anime4k" ? selectedShaders : undefined,
      temporalDenoise: upscaler === "anime4k" ? temporalDenoise : undefined,
    };
    const id = useUpscaleQueueStore
      .getState()
      .addUpscaleItem(filePath, fileNameFromPath(filePath), config);
    setActiveItemId(id);
    setOpen(false);
    resetState();
  }, [
    filePath,
    resolution,
    fpsValue,
    quality,
    gpuBackend,
    videoCodec,
    upscaler,
    selectedShaders,
    temporalDenoise,
    t,
    resetState,
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
    setOpen(false);
    resetState();
  }, [filePath, targetFormat, copyStreams, resetState]);

  const handleCancel = useCallback(async () => {
    await invokeTyped("cancel_upscale");
  }, []);

  const handleAddToQueue = useCallback(() => {
    if (activeTab === "upscale") {
      const [w, h] = resolution === "original" ? [0, 0] : resolution.split("x").map(Number);
      const interpolate = fpsValue === "60i";
      const fps = fpsValue === "60" || fpsValue === "60i" ? 60 : fpsValue ? Number(fpsValue) : null;
      const config: UpscaleConfig = {
        width: w,
        height: h,
        targetFps: fps,
        interpolate,
        quality,
        gpuBackend,
        videoCodec,
        aiUpscaler: upscaler === "ffmpeg" ? null : upscaler,
        selectedShaders: upscaler === "anime4k" ? selectedShaders : undefined,
        temporalDenoise: upscaler === "anime4k" ? temporalDenoise : undefined,
      };
      useUpscaleQueueStore.getState().addUpscaleItem(filePath, fileNameFromPath(filePath), config);
    } else {
      const config: ConvertConfig = {
        targetFormat,
        copyStreams,
      };
      useUpscaleQueueStore.getState().addConvertItem(filePath, fileNameFromPath(filePath), config);
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
    videoCodec,
    upscaler,
    selectedShaders,
    temporalDenoise,
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
    activeItem && (activeItem.status === "queued" || activeItem.status === "processing");

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
        title={isInQueue ? t("player.upscale.in.queue") : t("player.upscale.title")}
        disabled={!exists || isInQueue}
      >
        <Wand2 className="size-3" />
      </Button>

      {open && (
        <Modal
          header={`${t(activeTab === "upscale" ? "player.tab.upscale" : "player.tab.convert")}: ${fileNameFromPath(filePath)}`}
          onClose={handleClose}
          className="min-w-xl"
        >
          {showConfig && (
            <div className="flex flex-col">
              <Tabs
                ariaLabel={t(activeTab === "upscale" ? "player.tab.upscale" : "player.tab.convert")}
                tabs={TABS.map((tab) => ({
                  ...tab,
                  label: t(tab.label),
                }))}
                activeTab={activeTab}
                onChange={setActiveTab}
              />

              <section className="windows95-border flex-1 overflow-hidden p-1">
                <UpscaleConfigPanel
                  filePath={filePath}
                  activeTab={activeTab}
                  resolution={resolution}
                  setResolution={setResolution}
                  upscaler={upscaler}
                  setUpscaler={setUpscaler}
                  quality={quality}
                  setQuality={setQuality}
                  videoCodec={videoCodec}
                  setVideoCodec={setVideoCodec}
                  fpsValue={fpsValue}
                  setFpsValue={setFpsValue}
                  gpuBackend={gpuBackend}
                  setGpuBackend={setGpuBackend}
                  gpuOptions={gpuOptions}
                  anime4kPreset={anime4kPreset}
                  onPresetChange={handlePresetChange}
                  selectedShaders={selectedShaders}
                  setSelectedShaders={setSelectedShaders}
                  temporalDenoise={temporalDenoise}
                  setTemporalDenoise={setTemporalDenoise}
                  suggestion={suggestion ?? null}
                  ffmpegStatus={ffmpegStatus}
                  setFfmpegStatus={setFfmpegStatus}
                  targetFormat={targetFormat}
                  setTargetFormat={setTargetFormat}
                  copyStreams={copyStreams}
                  setCopyStreams={setCopyStreams}
                />
              </section>

              <div className="mt-2 flex flex-row justify-end gap-1">
                <Button onClick={handleClose}>{t("common.cancel")}</Button>
                <Button onClick={handleAddToQueue}>{t("player.upscale.to.queue")}</Button>
                <Button onClick={activeTab === "upscale" ? startUpscale : startConvert}>
                  {t(activeTab === "upscale" ? "player.upscale.start" : "player.upscale.convert")}
                </Button>
              </div>
            </div>
          )}

          {showProgress && <UpscaleProgressPanel activeItem={activeItem} onCancel={handleCancel} />}

          <UpscaleStatusPanels
            localError={localError}
            activeItem={activeItem}
            onClose={handleClose}
          />
        </Modal>
      )}
    </>
  );
}
