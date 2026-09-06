export const ANIME4K_PRESETS: {
  label: string;
  value: string;
  shaders: string[];
  quality: string;
  gpuBackend: string;
}[] = [
  {
    gpuBackend: "gpu",
    label: "player.preset.lightning",
    quality: "ultrafast",
    shaders: ["clamp", "upscale_cnn_x2_s"],
    value: "lightning",
  },
  {
    gpuBackend: "gpu",
    label: "player.preset.fast",
    quality: "fast",
    shaders: ["clamp", "restore_cnn_s", "upscale_cnn_x2_s"],
    value: "fast",
  },
  {
    gpuBackend: "cpu",
    label: "player.preset.balanced",
    quality: "slow",
    shaders: ["clamp", "restore_cnn_l", "upscale_cnn_x2_l", "thin_fast"],
    value: "balanced",
  },
  {
    gpuBackend: "cpu",
    label: "player.preset.quality",
    quality: "slow",
    shaders: [
      "clamp",
      "denoise_bilateral_mean",
      "restore_cnn_soft_vl",
      "upscale_denoise_cnn_x2_vl",
      "thin_hq",
    ],
    value: "quality",
  },
  {
    gpuBackend: "cpu",
    label: "player.preset.maximum",
    quality: "veryslow",
    shaders: [
      "clamp",
      "denoise_bilateral_median",
      "deblur_dog",
      "restore_cnn_soft_vl",
      "upscale_denoise_cnn_x2_vl",
      "thin_hq",
      "darken_hq",
    ],
    value: "maximum",
  },
  {
    gpuBackend: "cpu",
    label: "player.preset.denoise",
    quality: "slow",
    shaders: ["clamp", "denoise_bilateral_median", "restore_cnn_ul", "upscale_denoise_cnn_x2_ul"],
    value: "denoise",
  },
  {
    gpuBackend: "cpu",
    label: "player.preset.clean",
    quality: "fast",
    shaders: ["clamp", "restore_cnn_m", "upscale_cnn_x2_m", "thin_fast"],
    value: "clean",
  },
  {
    gpuBackend: "cpu",
    label: "player.preset.retro",
    quality: "slow",
    shaders: [
      "clamp",
      "denoise_bilateral_mean",
      "deblur_dog",
      "restore_cnn_soft_vl",
      "upscale_denoise_cnn_x2_vl",
    ],
    value: "retro",
  },
];
