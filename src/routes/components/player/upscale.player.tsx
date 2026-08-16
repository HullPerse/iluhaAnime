import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Wand2, Ban, Check, Loader, ListVideo } from "lucide-react";
import { useState, useEffect, useCallback } from "react";

import Modal from "@/components/shared/modal.component";
import ProgressBar from "@/components/shared/progress.component";
import Tabs from "@/components/shared/tabs.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import Select from "@/components/ui/select.component";
import {
  ANIME4K_PRESETS,
  FORMAT_OPTIONS,
  FPS_OPTIONS,
  GPU_LABELS,
  QUALITY_OPTIONS,
  RESOLUTIONS,
  TABS,
  UPSCALER_OPTIONS,
} from "@/config/player.config";
import { useI18n } from "@/lib/i18n";
import { fileNameFromPath, formatETA } from "@/lib/player.utils";
import { useUpscaleQueueStore } from "@/store/upscale.store";
import type { UpscaleConfig, ConvertConfig } from "@/types";

import FFMPEG from "./ffmpeg.player";
import ShaderPicker from "./shader.player";

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

  const { t } = useI18n();

  const activeItem = useUpscaleQueueStore((s) =>
    activeItemId ? (s.items.find((i) => i.id === activeItemId) ?? null) : null
  );

  const isInQueue = useUpscaleQueueStore((s) =>
    s.items.some(
      (i) =>
        i.filePath === filePath &&
        (i.status === "queued" || i.status === "processing")
    )
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
    [availableGpu]
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
      setLocalError(t("player.upscale.selectResolution"));
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
      aiUpscaler: upscaler === "ffmpeg" ? null : upscaler,
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
    t,
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
        aiUpscaler: upscaler === "ffmpeg" ? null : upscaler,
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
    activeItem?.speed &&
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
        title={
          isInQueue ? t("player.upscale.inQueue") : t("player.upscale.title")
        }
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
                tabs={TABS.map((tab) => ({
                  ...tab,
                  label: t(tab.label as never),
                }))}
                activeTab={activeTab}
                onChange={setActiveTab}
              />

              <section className="windows95-border flex-1 overflow-hidden p-1">
                {activeTab === "upscale" ? (
                  <div className="flex flex-col gap-2 pt-2">
                    <label className="windows95-text text-xs">
                      {t("player.upscale.resolution")}
                    </label>
                    <Select
                      value={resolution}
                      onChange={setResolution}
                      options={RESOLUTIONS.map((o) => ({
                        ...o,
                        label: t(o.label as never),
                      }))}
                    />

                    <label className="windows95-text text-xs">
                      {t("player.upscale.upscaler")}
                    </label>
                    <Select
                      value={upscaler}
                      onChange={setUpscaler}
                      options={UPSCALER_OPTIONS.map((o) => ({
                        ...o,
                        label: t(o.label as never),
                      }))}
                    />
                    {upscaler === "ffmpeg" && (
                      <FFMPEG
                        status={ffmpegStatus}
                        setStatus={setFfmpegStatus}
                      />
                    )}

                    {upscaler === "anime4k" && (
                      <span className="windows95-text text-xs">
                        {t("player.upscale.requiresVulkan")}
                      </span>
                    )}

                    <label className="windows95-text text-xs">
                      {t("player.upscale.fps")}
                    </label>
                    <Select
                      value={fpsValue}
                      onChange={setFpsValue}
                      options={FPS_OPTIONS.map((o) => ({
                        ...o,
                        label: t(o.label as never),
                      }))}
                    />

                    {upscaler === "anime4k" ? (
                      <>
                        <label className="windows95-text text-xs">
                          {t("player.upscale.anime4kMode")}
                        </label>
                        <Select
                          value={anime4kPreset}
                          onChange={handlePresetChange}
                          options={ANIME4K_PRESETS.map((p) => ({
                            ...p,
                            label: t(p.label as never),
                          }))}
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
                          {t("player.upscale.quality")}
                        </label>
                        <Select
                          value={quality}
                          onChange={setQuality}
                          options={QUALITY_OPTIONS.map((o) => ({
                            ...o,
                            label: t(o.label as never),
                          }))}
                        />

                        {gpuOptions.length > 1 && (
                          <>
                            <label className="windows95-text text-xs">
                              {t("player.upscale.codec")}
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
                      {t("player.upscale.targetFormat")}
                    </label>
                    <Select
                      value={targetFormat}
                      onChange={setTargetFormat}
                      options={FORMAT_OPTIONS}
                    />

                    <label className="windows95-text flex cursor-pointer items-center gap-2 text-xs select-none">
                      <Checkbox
                        checked={copyStreams}
                        onChange={setCopyStreams}
                      />
                      <span>{t("player.upscale.copyStreams")}</span>
                    </label>

                    {!copyStreams && (
                      <span className="windows95-text text-muted text-[10px]">
                        {t("player.upscale.reencode")}
                      </span>
                    )}
                  </div>
                )}
              </section>

              <div className="mt-2 flex flex-row justify-end gap-1">
                <Button onClick={handleClose}>{t("common.cancel")}</Button>
                <Button onClick={handleAddToQueue}>
                  {t("player.upscale.toQueue")}
                </Button>
                <Button
                  onClick={
                    activeTab === "upscale" ? startUpscale : startConvert
                  }
                >
                  {t(
                    activeTab === "upscale"
                      ? "player.upscale.start"
                      : "player.upscale.convert"
                  )}
                </Button>
              </div>
            </div>
          )}

          {showProgress && (
            <div className="flex min-w-xl flex-col gap-2 p-1">
              {activeItem?.status === "queued" && (
                <div className="flex flex-col items-center gap-2 py-4">
                  <ListVideo className="text-muted size-5" />
                  <span className="windows95-text text-xs">
                    {t("player.upscale.queued")}
                  </span>
                </div>
              )}

              {activeItem?.status === "processing" &&
                stage === "initializing" && (
                  <div className="flex flex-col items-center gap-2 py-4">
                    <Loader className="size-5 animate-spin" />
                    <span className="windows95-text text-xs">
                      {t("player.upscale.initializing")}
                    </span>
                  </div>
                )}

              {stage === "encoding" && (
                <>
                  <ProgressBar
                    value={activeItem?.current ?? 0}
                    max={activeItem?.total ?? 1}
                  />
                  <span className="windows95-text text-center text-xs">
                    {activeItem?.progress ?? 0}%
                  </span>
                  {etaSecs != null && (
                    <span className="windows95-text text-muted text-center text-xs">
                      {t("player.upscale.eta", { time: formatETA(etaSecs, t) })}
                    </span>
                  )}
                </>
              )}

              <div className="mt-1 flex flex-row justify-center gap-1">
                <Button variant="destructive" onClick={handleCancel}>
                  <Ban className="size-3" />
                  {t("player.upscale.cancel")}
                </Button>
              </div>
            </div>
          )}

          {showLocalError && (
            <div className="flex flex-col items-center gap-2 p-1">
              <span className="text-destructive windows95-text text-center text-xs">
                {localError}
              </span>
              <Button onClick={handleClose}>{t("player.common.close")}</Button>
            </div>
          )}

          {showItemError && (
            <div className="flex flex-col items-center gap-2 p-1">
              <span className="text-destructive windows95-text text-center text-xs">
                {activeItem?.error ?? t("common.error")}
              </span>
              <Button onClick={handleClose}>{t("player.common.close")}</Button>
            </div>
          )}

          {showDone && (
            <div className="flex flex-col items-center gap-2 p-1">
              <Check className="text-success size-6" />
              <span className="windows95-text text-xs">
                {t("player.upscale.done")}
              </span>
              <Button onClick={handleClose}>{t("player.common.close")}</Button>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
