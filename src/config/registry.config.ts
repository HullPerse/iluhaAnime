export interface ConfigRegistryEntry {
  domain: string;
  file: string;
  keys: string[];
}

export const CONFIG_REGISTRY: readonly ConfigRegistryEntry[] = [
  { domain: "anilist", file: "anilist/activity.config.ts", keys: ["ACTIVITY_STATUS_FILTERS", "ACTIVITY_STATUS_ICONS", "ACTIVITY_STATUS_LABELS", "CELL_GAP", "CELL_LEVELS", "CELL_SIZE"] },
  { domain: "anilist", file: "anilist/anilistFilters.config.ts", keys: ["ANILIST_GENRES", "ANILIST_NSFW_TAGS", "ANILIST_TAGS", "BROWSE_GENRE_COUNT", "defaultFilters", "DETAIL_TAG_COUNT", "FORMATS", "NSFW_TAG_SET", "SEASONS", "STATUSES"] },
  { domain: "anilist", file: "anilist/status.config.ts", keys: ["ANIME_STATUS_BOOST"] },
  { domain: "anilist", file: "anilist/statuses.config.ts", keys: ["DEFAULT_COLLECTION_STATUSES", "DEFAULT_NEW_COLOR", "PUBLIC_STATUS_MAX_ITEMS", "STATUS_SHRINK_AT", "STATUS_SHRINK_CLASS", "STATUS_SHRINK_MIN_AT", "STATUS_TAB_WIDTH"] },
  { domain: "graphics", file: "graphics/blueNoise.config.ts", keys: ["BLUE_NOISE_64", "BLUE_NOISE_RANGE", "BLUE_NOISE_SIZE"] },
  { domain: "graphics", file: "graphics/graph.config.ts", keys: ["EDGE_STYLES", "FILTER_GROUPS", "FILTER_LABELS", "FORMAT_SHORT", "FRANCHISE_VIEWPORT", "IMG_H", "NODE_BORDER_COLORS", "NODE_H", "NODE_SCALE_TIERS", "NODE_W", "RELATION_FILTERS", "RELATION_X"] },
  { domain: "graphics", file: "graphics/icons.config.ts", keys: ["playerIcons"] },
  { domain: "graphics", file: "graphics/screenshot.config.ts", keys: ["ANNOTATION_*", "CROP_*", "SCREENSHOT_*"] },
  { domain: "graphics", file: "graphics/sizes.config.ts", keys: ["SIZE_MULTIPLIERS"] },
  { domain: "graphics", file: "graphics/tags.config.ts", keys: ["TAG_*"] },
  { domain: "graphics", file: "graphics/themes.config.ts", keys: ["DEFAULT_THEME_COLORS", "THEME_ACCENT_EXEMPT", "THEME_COLOR_KEYS", "THEME_FAMILIES", "THEME_OVERRIDE_VARS", "THEMES"] },
  { domain: "graphics", file: "graphics/wallpaper.config.ts", keys: ["WALLPAPER_*"] },
  { domain: "settings", file: "settings/find.config.ts", keys: ["anchorId", "FIND_GROUPS", "SETTINGS_FIND_*"] },
  { domain: "settings", file: "settings/flags.config.ts", keys: ["FLAG_*"] },
  { domain: "settings", file: "settings/keybinds.config.ts", keys: ["DIGIT_KEYS", "KEYBINDS", "OFFSET_*", "PLAYER_HOTKEYS", "SEEK_STEP", "VIEW_MODE_DIGITS"] },
  { domain: "settings", file: "settings/modes.config.ts", keys: ["CRT_*", "PLAYER_CABINETS", "PLAYER_CABINET_IDS", "PLAYER_MODES", "PLAYER_MODE_IDS"] },
  { domain: "settings", file: "settings/options.config.ts", keys: ["FORMAT_OPTIONS", "FPS_OPTIONS", "GPU_LABELS", "QUALITY_OPTIONS", "RESOLUTIONS", "TABS", "UPSCALER_OPTIONS", "VIDEO_CODEC_OPTIONS"] },
  { domain: "settings", file: "settings/presets.config.ts", keys: ["ANIME4K_PRESETS"] },
  { domain: "settings", file: "settings/profiles.config.ts", keys: ["PLAYER_PROFILES", "PLAYER_PROFILE_IDS"] },
  { domain: "settings", file: "settings/settingsDefaults.config.ts", keys: ["DEFAULT_SETTINGS", "DEFAULT_WALLPAPER_FILTERS", "DEFAULT_WALLPAPER_SHADOW"] },
  { domain: "settings", file: "settings/vim.config.ts", keys: ["TREE_*", "VIM_*"] },
  { domain: "system", file: "system/changelog.config.ts", keys: ["CHANGELOG"] },
  { domain: "system", file: "system/notifications.config.ts", keys: ["NOTIFICATION_*", "POLL_INTERVALS_MIN", "TOAST_*"] },
];