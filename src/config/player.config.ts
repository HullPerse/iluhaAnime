export const playerIcons = [
  "w2k_bitmap_image.ico",
  "w2k_computer.ico",
  "w2k_dustbin.ico",
  "w2k_floppy.ico",
  "w2k_folder_closed.ico",
  "w2k_globe.ico",
  "w2k_sharing.ico",
  "w2k_wmp_11.ico",
  "w98_directory_admin_tools.ico",
  "w98_directory_business_calendar.ico",
  "w98_directory_channels.ico",
  "w98_directory_closed_history.ico",
  "w98_directory_folder_options.ico",
  "w98_directory_fonts.ico",
  "w98_directory_fonts_cool.ico",
  "w98_directory_fonts_shortcut.ico",
  "w98_directory_movie.ico",
  "w98_directory_network_conn.ico",
  "w98_directory_network_conn_shortcut.ico",
  "w98_directory_net_web.ico",
  "w98_directory_zipper.ico",
  "w98_help_book_cool.ico",
  "w98_internet_connection_wiz.ico",
  "w98_internet_options.ico",
  "w98_msagent.ico",
  "w98_msg_warning.ico",
  "w98_msg_warning_inv.ico",
  "w98_msn_cool.ico",
  "w98_search_directory.ico",
  "w98_SoundGrn.ico",
  "w98_SoundPu2.ico",
  "w98_SoundPur.ico",
  "w98_SoundTel.ico",
  "w98_SoundVor.ico",
  "w98_SoundYel.ico",
  "w98_template_empty.ico",
  "w98_template_nework_conn.ico",
  "w98_template_nework_places.ico",
  "w98_template_printer.ico",
  "w98_template_scanner_camera.ico",
  "w98_template_world.ico",
  "w98_tree.ico",
  "w98_trust0.ico",
  "w98_trust1_restrict.ico",
  "w98_users.ico",
  "w98_users_green.ico",
  "w98_video_.ico",
  "w98_video_gr.ico",
  "w98_video_mg.ico",
  "w98_video_mk.ico",
  "w98_video_tl.ico",
  "w98_world.ico",
  "wxp_1001.ico",
  "wxp_173.ico",
  "wxp_235.ico",
  "wxp_236.ico",
  "wxp_237.ico",
  "wxp_239.ico",
  "wxp_244.ico",
  "wxp_257.ico",
  "wxp_259.ico",
  "wxp_268.ico",
  "wxp_274.ico",
  "wxp_276.ico",
  "wxp_277.ico",
  "wxp_279.ico",
  "wxp_303.ico",
  "wxp_306.ico",
  "wxp_307.ico",
  "wxp_308.ico",
  "wxp_309.ico",
  "wxp_317.ico",
  "wxp_319.ico",
  "wxp_338.ico",
  "wxp_downloadfolder.ico",
  "unknown_source.png",
  "update_icon.ico",
  "user_avatar.ico",
];

export const GPU_LABELS: Record<string, string> = {
  cpu: "CPU (x264)",
  nvenc: "NVIDIA NVENC",
  amf: "AMD AMF",
  qsv: "Intel QSV",
};

export const RESOLUTIONS = [
  { label: "Оригинальное", value: "original" },
  { label: "1920\u00d71080 (1080p)", value: "1920x1080" },
  { label: "2560\u00d71440 (2K)", value: "2560x1440" },
  { label: "3840\u00d72160 (4K)", value: "3840x2160" },
];

export const FPS_OPTIONS = [
  { label: "Оригинальный", value: "" },
  { label: "30", value: "30" },
  { label: "60 (дублирование)", value: "60" },
  { label: "60 (интерполяция)", value: "60i" },
];

export const QUALITY_OPTIONS = [
  { label: "Самый быстрый", value: "ultrafast" },
  { label: "Быстрый", value: "fast" },
  { label: "Медленный", value: "slow" },
  { label: "Самый медленный", value: "veryslow" },
];

export const UPSCALER_OPTIONS = [
  { label: "Lanczos (ffmpeg)", value: "ffmpeg" },
  { label: "Anime4K (GPU шейдеры)", value: "anime4k" },
];

export const ANIME4K_PRESETS: {
  label: string;
  value: string;
  shaders: string[];
  quality: string;
  gpuBackend: string;
}[] = [
  {
    label: "Самый быстрый",
    value: "lightning",
    shaders: ["clamp", "upscale_cnn_x2_s"],
    quality: "ultrafast",
    gpuBackend: "gpu",
  },
  {
    label: "Быстрый",
    value: "fast",
    shaders: ["clamp", "restore_cnn_ul", "upscale_cnn_x2_ul"],
    quality: "fast",
    gpuBackend: "gpu",
  },
  {
    label: "Сбалансированный",
    value: "balanced",
    shaders: ["clamp", "restore_cnn_l", "upscale_cnn_x2_l", "thin_fast"],
    quality: "slow",
    gpuBackend: "cpu",
  },
  {
    label: "Качественный",
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
    label: "Максимальный",
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
    label: "С шумоподавлением",
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
    label: "Для чистого аниме",
    value: "clean",
    shaders: ["clamp", "restore_cnn_m", "upscale_cnn_x2_m", "thin_fast"],
    quality: "fast",
    gpuBackend: "cpu",
  },
  {
    label: "Ретро (DVD)",
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

export const FORMAT_OPTIONS = [
  { label: "MP4 (H.264)", value: "mp4" },
  { label: "MKV", value: "mkv" },
  { label: "AVI", value: "avi" },
  { label: "MOV", value: "mov" },
  { label: "WebM", value: "webm" },
  { label: "M4V", value: "m4v" },
  { label: "TS", value: "ts" },
];

export const TABS = [
  { id: "upscale" as const, label: "Апскейл" },
  { id: "convert" as const, label: "Конвертация" },
];
