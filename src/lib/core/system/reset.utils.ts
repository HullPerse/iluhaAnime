import { DEFAULT_SETTINGS } from "@/config/settings/settingsDefaults.config";
import { getSettingsSnapshot, patchSettings } from "@/store/settings.store";
import type { SettingsData } from "@/types/store/settings";
import type { ResetSectionId } from "@/types/core/reset";

export type ResettableSetting = keyof typeof DEFAULT_SETTINGS | "language";

const RESET_DEFAULTS: Pick<SettingsData, ResettableSetting> = {
  ...DEFAULT_SETTINGS,
  language: "ru",
};

function toResettableSettings(
  fields: ResettableSetting | readonly ResettableSetting[]
): readonly ResettableSetting[] {
  return typeof fields === "string" ? [fields] : fields;
}

const SECTION_SETTING_KEYS: Record<ResetSectionId, readonly (keyof SettingsData)[]> = {
  "general.tabs": [
    "newsTabEnabled",
    "streamTabEnabled",
    "collectionTabEnabled",
    "anilistTabEnabled",
    "sqliteBrowserEnabled",
  ],
  "general.startup": ["fastLaunch", "rememberLastTab"],
  "general.keyboard": ["vimMode"],
  "general.window": ["minimizeToTray"],
  "general.ffmpeg": ["ffmpegSource"],
  "general.parse": [
    "parseTitlesPlayer",
    "parseTitlesTorrent",
    "parseTitlesSearch",
    "torrentCoverMode",
    "torrentCoverModeManual",
  ],
  "general.screenshot": ["screenshotDir", "screenshotFormat", "screenshotOpenFolder"],
  "notifications.system": ["notificationPopups"],
  "notifications.anilist": [
    "anilistReleaseNotifications",
    "notifyNewEpisodes",
    "notifyStatusChanges",
    "notifyMediaStatus",
    "notifySubscribedReplies",
    "notifyMediaMerge",
    "notifySequel",
    "anilistPollIntervalMin",
    "anilistNotifyLists",
  ],
  "notifications.torrents": ["notifyTorrentHealth", "notifyOnComplete", "notifyOnError"],
  "notifications.tasks": ["notifyUpscaleDone", "notifyModelDownloads", "notifyBackup"],
  "notifications.app": ["notifyScanErrors"],
  "search.sources": ["defaultSearchSource", "visibleSources"],
  "search.results": [
    "searchHistoryMaxItems",
    "anilistPageSize",
    "anilistMaxPages",
    "autocompleteMode",
    "anilistSuggestionBoost",
    "searchSymSpellEnabled",
    "searchIntentEnabled",
  ],
  "torrent.limits": ["limits"],
  "torrent.defaults": ["defaultDownloadDir", "maxConcurrentDownloads"],
  "torrent.schedule": ["speedSchedule"],
  "torrent.search": ["searchResultsPerPage"],
  "torrent.files": ["fileOrder"],
  "torrent.session": ["fastresumeEnabled", "disablePersistence"],
  "torrent.network": [
    "enableUpnp",
    "dhtEnabled",
    "pexEnabled",
    "ipv4Only",
    "listenPort",
    "peerConnectTimeout",
    "peerReadWriteTimeout",
  ],
  "proxy.anilist": ["anilistProxyUrl", "anilistTitleLanguage", "anilistAdultContent"],
  "proxy.news": ["newsProxyUrl"],
  "proxy.animelib": ["animelibProxyUrl"],
  "proxy.torrent": ["torrentProxyUrl"],
  "proxy.sources": ["searchProxyUrls", "webviewProxyEnabled"],
  "theme.schedule": ["themeSchedule"],
  "theme.retro": ["retroStyle", "uiDensity"],
  "theme.collection": ["collectionGroupHeaderStyle"],
  "theme.progress": ["progressStyle"],
  "theme.font": ["appFont"],
  "theme.effects": [
    "enable3dBorders",
    "buttonPressEffect",
    "customScrollbar",
    "modalBackdropOpacity",
  ],
  "theme.animation": [
    "modalAnimation",
    "enableAnimations",
    "animateCounters",
    "animateToasts",
    "animateSections",
    "animateModalContent",
    "animateOsd",
    "animateResultLists",
    "animateTabSwitch",
  ],
  "theme.experimental": [
    "searchType",
    "playerType",
    "playerContextMenu",
    "animeDetailWidth",
    "searchMascotEnabled",
    "statusBarEnabled",
    "roundedWindowCorners",
    "windowEffect",
    "windowTintOpacity",
    "yorhaScanlinesEnabled",
    "customTitleBarEnabled",
  ],
  "general.rpc": ["discordRpcEnabled"],
  "keybinds.list": ["keybindOverrides"],
};

const SECTION_SETTING_MAP = new Map<string, readonly (keyof SettingsData)[]>(
  Object.entries(SECTION_SETTING_KEYS)
);

export function sectionSettingKeys(sectionId: string): readonly (keyof SettingsData)[] {
  return SECTION_SETTING_MAP.get(sectionId) ?? [];
}

export function isDefaultSetting(
  fields: ResettableSetting | readonly ResettableSetting[]
): boolean {
  const current = getSettingsSnapshot();
  return toResettableSettings(fields).every(
    (field) => JSON.stringify(current[field]) === JSON.stringify(RESET_DEFAULTS[field])
  );
}

export function resetSetting(fields: ResettableSetting | readonly ResettableSetting[]): void {
  const partial: Partial<SettingsData> = {};
  for (const field of toResettableSettings(fields)) {
    Object.assign(partial, { [field]: RESET_DEFAULTS[field] });
  }
  patchSettings(partial);
}

export function resetSection(sectionId: ResetSectionId): void {
  resetSetting(SECTION_SETTING_KEYS[sectionId]);
}

export function sectionHasCustomReset(sectionId: string): boolean {
  return sectionId === "general.media" || sectionId === "keybinds.list";
}
