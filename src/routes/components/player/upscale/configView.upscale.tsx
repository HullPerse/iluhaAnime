import Tabs from "@/components/shared/tabs.component";
import { Button } from "@/components/ui/button.component";
import { TABS } from "@/config/settings/options.config";
import { useI18n } from "@/hooks/i18n.hook";
import type { UpscalePreviewController } from "@/types/core/upscalePreview";
import type { PreviewFrame } from "@/types/core/upscale";

import { UpscaleConfigPanel } from "@/routes/components/player/upscale/config.upscale";

export default function UpscaleConfigView({
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
  preview,
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
  preview: UpscalePreviewController;
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
          preview={preview}
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
