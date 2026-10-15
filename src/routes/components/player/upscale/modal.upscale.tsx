import { Wand2 } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";

import Modal from "@/components/shared/modal.component";
import Tabs from "@/components/shared/tabs.component";
import { Button } from "@/components/ui/button.component";
import { GPU_LABELS, TABS } from "@/config/player/options.config";
import { ANIME4K_PRESETS } from "@/config/player/presets.config";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { useKeybindTitle } from "@/hooks/keybindTitle.hook";
import { fileNameFromPath } from "@/lib/media/parse.utils";
import { formatParsedTitle } from "@/lib/player/title.utils";
import { queryKeys } from "@/lib/query/keys.utils";
import { useCell } from "@/lib/state/signal.hook";
import { withFallback } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { settingsAtoms } from "@/store/settings.store";
import { addConvertItem, addUpscaleItem, upscaleItems } from "@/store/upscale.store";
import type { UpscaleConfig, ConvertConfig, PreviewFrame } from "@/types/upscale";

import { PreviewZoom } from "../preview.player";
import { UpscaleConfigPanel } from "./config.upscale";
import { UpscaleProgressPanel } from "./progress.upscale";
import { UpscaleStatusPanels } from "./status.upscale";

function UpscaleConfigView({
  filePath,
  activeTab,
  onTabChange,
  resolution,
  onResolution,
  upscaler,
  onUpscaler,
  quality,
  onQuality,
  videoCodec,
  onVideoCodec,
  fpsValue,
  onFpsValue,
  gpuBackend,
  onGpuBackend,
  gpuOptions,
  anime4kPreset,
  onPresetChange,
  selectedShaders,
  onShaders,
  temporalDenoise,
  onTemporalDenoise,
  suggestion,
  ffmpegStatus,
  onFfmpegStatus,
  targetFormat,
  onTargetFormat,
  copyStreams,
  onCopyStreams,
  onPreviewZoom,
  onCancel,
  onQueue,
  onStartUpscale,
  onStartConvert,
}: {
  filePath: string;
  activeTab: "upscale" | "convert";
  onTabChange: (tab: "upscale" | "convert") => void;
  resolution: string;
  onResolution: (value: string) => void;
  upscaler: string;
  onUpscaler: (value: string) => void;
  quality: string;
  onQuality: (value: string) => void;
  videoCodec: string;
  onVideoCodec: (value: string) => void;
  fpsValue: string;
  onFpsValue: (value: string) => void;
  gpuBackend: string;
  onGpuBackend: (value: string) => void;
  gpuOptions: { value: string; label: string }[];
  anime4kPreset: string;
  onPresetChange: (preset: string) => void;
  selectedShaders: string[];
  onShaders: (value: string[]) => void;
  temporalDenoise: boolean;
  onTemporalDenoise: (value: boolean) => void;
  suggestion: { preset: string; reason: string } | null;
  ffmpegStatus: "checking" | "ok" | "missing" | "downloading";
  onFfmpegStatus: (status: "checking" | "ok" | "missing" | "downloading") => void;
  targetFormat: string;
  onTargetFormat: (value: string) => void;
  copyStreams: boolean;
  onCopyStreams: (value: boolean) => void;
  onPreviewZoom: (frame: PreviewFrame) => void;
  onCancel: () => void;
  onQueue: () => void;
  onStartUpscale: () => void;
  onStartConvert: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col">
      <div className="shrink-0">
        <Tabs
          ariaLabel={t(activeTab === "upscale" ? "player.tab.upscale" : "player.tab.convert")}
          tabs={TABS.map((tab) => ({
            ...tab,
            label: t(tab.label),
          }))}
          activeTab={activeTab}
          onChange={onTabChange}
        />
      </div>

      <section className="windows95-border flex-1 overflow-hidden p-1">
        <UpscaleConfigPanel
          filePath={filePath}
          activeTab={activeTab}
          resolution={resolution}
          setResolution={onResolution}
          upscaler={upscaler}
          setUpscaler={onUpscaler}
          quality={quality}
          setQuality={onQuality}
          videoCodec={videoCodec}
          setVideoCodec={onVideoCodec}
          fpsValue={fpsValue}
          setFpsValue={onFpsValue}
          gpuBackend={gpuBackend}
          setGpuBackend={onGpuBackend}
          gpuOptions={gpuOptions}
          anime4kPreset={anime4kPreset}
          onPresetChange={onPresetChange}
          selectedShaders={selectedShaders}
          setSelectedShaders={onShaders}
          temporalDenoise={temporalDenoise}
          setTemporalDenoise={onTemporalDenoise}
          suggestion={suggestion}
          ffmpegStatus={ffmpegStatus}
          setFfmpegStatus={onFfmpegStatus}
          targetFormat={targetFormat}
          setTargetFormat={onTargetFormat}
          copyStreams={copyStreams}
          setCopyStreams={onCopyStreams}
          onPreviewZoom={onPreviewZoom}
        />
      </section>

      <div className="mt-2 flex flex-row justify-end gap-1">
        <Button onClick={onCancel}>{t("common.cancel")}</Button>
        <Button onClick={onQueue}>{t("player.upscale.to.queue")}</Button>
        <Button onClick={activeTab === "upscale" ? onStartUpscale : onStartConvert}>
          {t(activeTab === "upscale" ? "player.upscale.start" : "player.upscale.convert")}
        </Button>
      </div>
    </div>
  );
}

export default function UpscalePlayer({
  filePath,
  onDone,
  exists = true,
}: {
  filePath: string;
  onDone?: () => void;
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
  const [zoomed, setZoomed] = useState<PreviewFrame | null>(null);

  const { t } = useI18n();

  const parseTitlesPlayer = useCell(settingsAtoms.parseTitlesPlayer);

  const items = useCell(upscaleItems);
  const activeItem = activeItemId ? (items.find((i) => i.id === activeItemId) ?? null) : null;

  const isInQueue = items.some(
    (i) => i.filePath === filePath && (i.status === "queued" || i.status === "processing")
  );
  const upscaleTitle = useKeybindTitle(t("player.upscale.title"), "tree.upscale");

  const { data: upscaleConfig } = useAppQuery("static", {
    queryKey: queryKeys.upscaleConfig(),
    queryFn: async () => {
      const [ffmpegOk, gpuEncoders, defaultShaders] = await Promise.all([
        withFallback(invokeTyped<boolean>("check_ffprobe"), false),
        withFallback(invokeTyped<string[]>("check_gpu_encoders"), ["cpu"]),
        withFallback(invokeTyped<string[]>("default_anime4k_shaders"), []),
      ]);
      return { ffmpegOk, gpuEncoders, defaultShaders };
    },
    enabled: open,
  });
  const { data: suggestion } = useAppQuery("static", {
    queryKey: queryKeys.upscaleSuggest(filePath),
    queryFn: () =>
      withFallback(
        invokeTyped<{ preset: string; reason: string }>("suggest_upscale_preset", {
          inputPath: filePath,
        }),
        null
      ),
    enabled: open,
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
    if (activeItem?.status === "done") onDone?.();
  }, [activeItem?.status, onDone]);

  useEffect(() => {
    setZoomed(null);
  }, [resolution, selectedShaders, temporalDenoise]);

  const resetState = useCallback(() => {
    setActiveItemId(null);
    setLocalError(null);
    setZoomed(null);
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
    const id = addUpscaleItem(filePath, fileNameFromPath(filePath), config);
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
    const id = addConvertItem(filePath, fileNameFromPath(filePath), config);
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
      addUpscaleItem(filePath, fileNameFromPath(filePath), config);
    } else {
      const config: ConvertConfig = {
        targetFormat,
        copyStreams,
      };
      addConvertItem(filePath, fileNameFromPath(filePath), config);
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
        title={isInQueue ? t("player.upscale.in.queue") : upscaleTitle}
        disabled={!exists || isInQueue}
      >
        <Wand2 className="size-3" />
      </Button>

      {open && (
        <Modal
          header={
            zoomed
              ? `${Math.round(zoomed.timestamp)}s`
              : `${t(activeTab === "upscale" ? "player.tab.upscale" : "player.tab.convert")}: ${parseTitlesPlayer ? formatParsedTitle(filePath, t) : fileNameFromPath(filePath)}`
          }
          onClose={handleClose}
          onBack={zoomed ? () => setZoomed(null) : undefined}
          className="min-w-xl"
        >
          {zoomed ? (
            <PreviewZoom frame={zoomed} />
          ) : (
            <>
              {showConfig && (
                <UpscaleConfigView
                  filePath={filePath}
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                  resolution={resolution}
                  onResolution={setResolution}
                  upscaler={upscaler}
                  onUpscaler={setUpscaler}
                  quality={quality}
                  onQuality={setQuality}
                  videoCodec={videoCodec}
                  onVideoCodec={setVideoCodec}
                  fpsValue={fpsValue}
                  onFpsValue={setFpsValue}
                  gpuBackend={gpuBackend}
                  onGpuBackend={setGpuBackend}
                  gpuOptions={gpuOptions}
                  anime4kPreset={anime4kPreset}
                  onPresetChange={handlePresetChange}
                  selectedShaders={selectedShaders}
                  onShaders={setSelectedShaders}
                  temporalDenoise={temporalDenoise}
                  onTemporalDenoise={setTemporalDenoise}
                  suggestion={suggestion ?? null}
                  ffmpegStatus={ffmpegStatus}
                  onFfmpegStatus={setFfmpegStatus}
                  targetFormat={targetFormat}
                  onTargetFormat={setTargetFormat}
                  copyStreams={copyStreams}
                  onCopyStreams={setCopyStreams}
                  onPreviewZoom={setZoomed}
                  onCancel={handleClose}
                  onQueue={handleAddToQueue}
                  onStartUpscale={startUpscale}
                  onStartConvert={startConvert}
                />
              )}

              {showProgress && (
                <UpscaleProgressPanel activeItem={activeItem} onCancel={handleCancel} />
              )}

              <UpscaleStatusPanels
                localError={localError}
                activeItem={activeItem}
                onClose={handleClose}
              />
            </>
          )}
        </Modal>
      )}
    </>
  );
}
