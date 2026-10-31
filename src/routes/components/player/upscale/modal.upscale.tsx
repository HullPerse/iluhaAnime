import { Wand2 } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";

import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { GPU_LABELS } from "@/config/settings/options.config";
import { ANIME4K_PRESETS } from "@/config/settings/presets.config";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { useKeybindTitle } from "@/hooks/keybindTitle.hook";
import { useUpscalePreview } from "@/hooks/player/upscalePreview.hook";
import { fileNameFromPath } from "@/lib/search/parse.utils";
import { formatParsedTitle } from "@/lib/player/playerTitle.utils";
import { queryKeys } from "@/lib/core/keys.utils";
import { useCell } from "@/lib/core/signal.hook";
import { withFallback } from "@/lib/core/attempt.utils";
import { invokeTyped } from "@/lib/core/invoke.utils";
import { settingsAtoms } from "@/store/settings.store";
import { addConvertItem, addUpscaleItem, upscaleItems } from "@/store/upscale.store";
import type { UpscaleConfig, ConvertConfig } from "@/types/core/upscale";

import { PreviewZoom } from "@/routes/components/player/preview/zoom.preview";
import UpscaleConfigView from "@/routes/components/player/upscale/configView.upscale";
import { UpscaleProgressPanel } from "@/routes/components/player/upscale/progress.upscale";
import { UpscaleStatusPanels } from "@/routes/components/player/upscale/status.upscale";

import { parseUpscaleFps } from "@/lib/player/upscaleFps.utils";
import { zoomedFrameAt, framePager } from "@/lib/player/upscaleModal.utils";

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
  const [zoomedIndex, setZoomedIndex] = useState<number | null>(null);

  const { t } = useI18n();

  const parseTitlesPlayer = useCell(settingsAtoms.parseTitlesPlayer);

  const preview = useUpscalePreview({ filePath, resolution, selectedShaders, temporalDenoise });
  const zoomedFrame = zoomedFrameAt(preview.frames, zoomedIndex);

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
    setZoomedIndex(null);
  }, [resolution, selectedShaders, temporalDenoise]);

  const resetState = useCallback(() => {
    setActiveItemId(null);
    setLocalError(null);
    setZoomedIndex(null);
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
    const fps = parseUpscaleFps(fpsValue);
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
      const fps = parseUpscaleFps(fpsValue);
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
            zoomedFrame
              ? `${Math.round(zoomedFrame.timestamp)}s`
              : `${t(activeTab === "upscale" ? "player.tab.upscale" : "player.tab.convert")}: ${parseTitlesPlayer ? formatParsedTitle(filePath, t) : fileNameFromPath(filePath)}`
          }
          onClose={handleClose}
          onBack={zoomedFrame ? () => setZoomedIndex(null) : undefined}
          pager={framePager(preview.frames, zoomedIndex, t("common.frames"), setZoomedIndex)}
          className="min-w-xl"
        >
          {zoomedFrame ? (
            <PreviewZoom frame={zoomedFrame} />
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
                  preview={preview}
                  onPreviewZoom={(frame) => setZoomedIndex(preview.frames.indexOf(frame))}
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
