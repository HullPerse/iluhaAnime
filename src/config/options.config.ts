import type { TranslationKey } from "@/types/i18n";

export const GPU_LABELS: Record<string, string> = {
  amf: "AMD AMF",
  cpu: "CPU (x264)",
  nvenc: "NVIDIA NVENC",
  qsv: "Intel QSV",
};

export const RESOLUTIONS = [
  { label: "player.option.original", value: "original" },
  { label: "1920\u00D71080 (1080p)", value: "1920x1080" },
  { label: "2560\u00D71440 (2K)", value: "2560x1440" },
  { label: "3840\u00D72160 (4K)", value: "3840x2160" },
];

export const FPS_OPTIONS = [
  { label: "player.option.fps.original", value: "" },
  { label: "30", value: "30" },
  { label: "player.option.fps60dup", value: "60" },
  { label: "player.option.fps60interp", value: "60i" },
];

export const QUALITY_OPTIONS = [
  { label: "player.option.quality.fastest", value: "ultrafast" },
  { label: "player.option.quality.fast", value: "fast" },
  { label: "player.option.quality.slow", value: "slow" },
  { label: "player.option.quality.slowest", value: "veryslow" },
];

export const UPSCALER_OPTIONS = [
  { label: "Lanczos (ffmpeg)", value: "ffmpeg" },
  { label: "player.option.upscaler.anime4k", value: "anime4k" },
  { label: "player.option.upscaler.realcugan", value: "realcugan" },
];
export const VIDEO_CODEC_OPTIONS = [
  { label: "player.upscale.video.codec.h264", value: "h264" },
  { label: "player.upscale.video.codec.hevc", value: "hevc" },
  { label: "player.upscale.video.codec.hevc10", value: "hevc10" },
];

export const FORMAT_OPTIONS = [
  { label: "MP4 (H.264)", value: "mp4" },
  { label: "MKV", value: "mkv" },
  { label: "AVI", value: "avi" },
  { label: "MOV", value: "mov" },
  { label: "WebM", value: "webm" },
  { label: "M4V", value: "m4v" },
  { label: "TS", value: "ts" },
];

export const TABS: { id: "upscale" | "convert"; label: TranslationKey }[] = [
  { id: "upscale", label: "player.tab.upscale" },
  { id: "convert", label: "player.tab.convert" },
];
