import { useQuery } from "@tanstack/react-query";

import { Checkbox } from "@/components/ui/checkbox.component";
import Select from "@/components/ui/select.component";
import {
  FORMAT_OPTIONS,
  FPS_OPTIONS,
  QUALITY_OPTIONS,
  RESOLUTIONS,
  UPSCALER_OPTIONS,
  VIDEO_CODEC_OPTIONS,
} from "@/config/player/options.config";
import { ANIME4K_PRESETS } from "@/config/player/presets.config";
import { useI18n } from "@/lib/locale/i18n.utils";
import { formatETA } from "@/lib/player/title.utils";
import { withFallback } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";

import FFMPEG from "../ffmpeg.player";
import { UpscalePreview } from "../preview.player";
import { RealCUGAN } from "../realcugan.player";
import { RIFE } from "../rife.player";
import ShaderPicker from "../shader.player";

export function UpscaleConfigPanel({
  filePath,
  activeTab,
  resolution,
  setResolution,
  upscaler,
  setUpscaler,
  fpsValue,
  setFpsValue,
  quality,
  setQuality,
  videoCodec,
  setVideoCodec,
  gpuBackend,
  setGpuBackend,
  gpuOptions,
  anime4kPreset,
  onPresetChange,
  selectedShaders,
  setSelectedShaders,
  temporalDenoise,
  setTemporalDenoise,
  suggestion,
  ffmpegStatus,
  setFfmpegStatus,
  targetFormat,
  setTargetFormat,
  copyStreams,
  setCopyStreams,
}: {
  filePath: string;
  activeTab: "upscale" | "convert";
  resolution: string;
  setResolution: (value: string) => void;
  upscaler: string;
  setUpscaler: (value: string) => void;
  fpsValue: string;
  setFpsValue: (value: string) => void;
  quality: string;
  setQuality: (value: string) => void;
  videoCodec: string;
  setVideoCodec: (value: string) => void;
  gpuBackend: string;
  setGpuBackend: (value: string) => void;
  gpuOptions: { value: string; label: string }[];
  anime4kPreset: string;
  onPresetChange: (preset: string) => void;
  selectedShaders: string[];
  setSelectedShaders: (value: string[]) => void;
  temporalDenoise: boolean;
  setTemporalDenoise: (value: boolean) => void;
  suggestion: { preset: string; reason: string } | null | undefined;
  ffmpegStatus: "checking" | "ok" | "missing" | "downloading";
  setFfmpegStatus: (status: "checking" | "ok" | "missing" | "downloading") => void;
  targetFormat: string;
  setTargetFormat: (value: string) => void;
  copyStreams: boolean;
  setCopyStreams: (value: boolean) => void;
}) {
  const { t } = useI18n();
  const [w, h] = resolution === "original" ? [0, 0] : resolution.split("x").map(Number);
  const targetFps =
    fpsValue === "60" || fpsValue === "60i" ? 60 : fpsValue ? Number(fpsValue) : null;
  const { data: estimate } = useQuery({
    queryKey: [
      "upscale_estimate",
      filePath,
      resolution,
      fpsValue,
      quality,
      gpuBackend,
      videoCodec,
      upscaler,
      anime4kPreset,
      selectedShaders.join(","),
      temporalDenoise,
    ],
    queryFn: () =>
      withFallback(
        invokeTyped<{ seconds: number }>("estimate_upscale_time", {
          aiUpscaler: upscaler === "ffmpeg" ? null : upscaler,
          gpuBackend,
          height: h,
          inputPath: filePath,
          interpolate: fpsValue === "60i",
          quality,
          selectedShaders: upscaler === "anime4k" ? selectedShaders : undefined,
          targetFps,
          temporalDenoise: upscaler === "anime4k" ? temporalDenoise : undefined,
          videoCodec,
          width: w,
        }),
        null
      ),
    staleTime: Infinity,
  });
  if (activeTab === "convert") {
    return (
      <div className="flex flex-col gap-2 pt-2">
        <label className="windows95-text text-xs">{t("player.upscale.target.format")}</label>
        <Select value={targetFormat} onChange={setTargetFormat} options={FORMAT_OPTIONS} />

        <label className="windows95-text flex cursor-pointer items-center gap-2 text-xs select-none">
          <Checkbox checked={copyStreams} onChange={setCopyStreams} />
          <span>{t("player.upscale.copy.streams")}</span>
        </label>

        {!copyStreams && (
          <span className="windows95-text text-hint text-xs">{t("player.upscale.reencode")}</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 pt-2">
      <label className="windows95-text text-xs">{t("player.upscale.resolution")}</label>
      <Select
        value={resolution}
        onChange={setResolution}
        options={RESOLUTIONS.map((o) => ({
          ...o,
          label: t(o.label as never),
        }))}
      />

      <label className="windows95-text text-xs">{t("player.upscale.upscaler")}</label>
      <Select
        value={upscaler}
        onChange={setUpscaler}
        options={UPSCALER_OPTIONS.map((o) => ({
          ...o,
          label: t(o.label as never),
        }))}
      />
      {upscaler === "ffmpeg" && <FFMPEG status={ffmpegStatus} setStatus={setFfmpegStatus} />}

      {upscaler === "anime4k" && (
        <span className="windows95-text text-xs">{t("player.upscale.requires.vulkan")}</span>
      )}

      <label className="windows95-text text-xs">{t("player.upscale.fps")}</label>
      <Select
        value={fpsValue}
        onChange={setFpsValue}
        options={FPS_OPTIONS.map((o) => ({
          ...o,
          label: t(o.label as never),
        }))}
      />
      {fpsValue === "60i" && <RIFE />}
      <label className="windows95-text text-xs">{t("player.upscale.video.codec")}</label>
      <Select
        value={videoCodec}
        onChange={setVideoCodec}
        options={VIDEO_CODEC_OPTIONS.map((o) => ({
          ...o,
          label: t(o.label as never),
        }))}
      />
      {estimate && estimate.seconds > 0 && (
        <span className="text-hint text-xs">
          {t("player.upscale.estimated", { time: formatETA(estimate.seconds, t) })}
        </span>
      )}

      {upscaler === "anime4k" ? (
        <>
          <label className="windows95-text text-xs">{t("player.upscale.anime4k.mode")}</label>
          <Select
            value={anime4kPreset}
            onChange={onPresetChange}
            options={ANIME4K_PRESETS.map((p) => ({
              ...p,
              label: t(p.label as never),
            }))}
          />
          {suggestion && (
            <span className="text-hint text-xs">
              {t("player.upscale.suggested", {
                preset: t(
                  (ANIME4K_PRESETS.find((p) => p.value === suggestion.preset)?.label ??
                    suggestion.preset) as never
                ),
                reason: t(`player.upscale.suggest.${suggestion.reason}` as never),
              })}
            </span>
          )}
          <ShaderPicker
            value={selectedShaders}
            onChange={setSelectedShaders}
            gpuBackend={gpuBackend}
          />
          <label className="windows95-text flex cursor-pointer items-center gap-2 text-xs select-none">
            <Checkbox checked={temporalDenoise} onChange={setTemporalDenoise} />
            <span>{t("player.upscale.temporal.denoise")}</span>
          </label>
          <UpscalePreview
            key={`${resolution}-${selectedShaders.join(",")}-${temporalDenoise}`}
            filePath={filePath}
            resolution={resolution}
            selectedShaders={selectedShaders}
            temporalDenoise={temporalDenoise}
          />
        </>
      ) : (
        <>
          <label className="windows95-text text-xs">{t("player.upscale.quality")}</label>
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
              <label className="windows95-text text-xs">{t("player.upscale.codec")}</label>
              <Select value={gpuBackend} onChange={setGpuBackend} options={gpuOptions} />
            </>
          )}
          {upscaler === "realcugan" && <RealCUGAN />}
        </>
      )}
    </div>
  );
}
