import { DEFAULT_SETTINGS } from "@/config/settings/settingsDefaults.config";
import { patchSettings } from "@/store/settings.store";
import type { SettingsDefaults, SettingsStore } from "@/types/ui/settings";
import type { ResetSectionId } from "@/types/core/reset";

export const SECTION_SETTING_KEYS: Record<ResetSectionId, (keyof SettingsStore)[]> = {
  "general.tabs": ["collectionTabEnabled", "anilistTabEnabled", "sqliteBrowserEnabled"],
  "general.startup": ["fastLaunch", "rememberLastTab"],
  "general.keyboard": ["vimMode"],
  "general.window": ["minimizeToTray"],
  "general.language": ["language", "ffmpegSource"],
  "general.tmdb": ["tmdbKeySet", "tmdbProxyUrl"],
  "general.anilist": ["anilistProxyUrl", "anilistTitleLanguage", "anilistAdultContent"],
  "general.animelib": ["animelibProxyUrl"],
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
  "notifications.torrents": ["notifyTorrentHealth"],
  "notifications.tasks": ["notifyUpscaleDone", "notifyModelDownloads", "notifyBackup"],
  "notifications.app": ["notifyScanErrors"],
  "search.sources": [
    "defaultSearchSource",
    "visibleSources",
    "searchProxyUrls",
    "webviewProxyEnabled",
  ],
  "search.results": [
    "searchHistoryMaxItems",
    "pageSize",
    "anilistMaxPages",
    "autocompleteMode",
    "anilistSuggestionBoost",
    "searchSymSpellEnabled",
    "searchIntentEnabled",
  ],
  "torrent.limits": ["limits"],
  "torrent.defaults": ["defaultDownloadDir", "maxConcurrentDownloads"],
  "torrent.schedule": ["speedSchedule"],
  "torrent.search": ["resultsPerPage"],
  "torrent.files": ["fileOrder"],
  "torrent.notifications": ["notifyOnComplete", "notifyOnError"],
  "torrent.session": ["fastresumeEnabled", "disablePersistence"],
  "torrent.network": [
    "enableUpnp",
    "dhtEnabled",
    "pexEnabled",
    "ipv4Only",
    "listenPort",
    "peerConnectTimeout",
    "peerReadWriteTimeout",
    "torrentProxyUrl",
  ],
  "theme.schedule": ["themeSchedule"],
  "theme.retro": ["retroStyle", "uiDensity", "collectionGroupHeaderStyle"],
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

export function resetSection(sectionId: ResetSectionId): void {
  const keys = SECTION_SETTING_KEYS[sectionId];
  const partial: Partial<SettingsDefaults> = {};
  for (const key of keys) {
    (partial as Record<string, unknown>)[key] = (
      DEFAULT_SETTINGS as unknown as Record<string, unknown>
    )[key];
  }
  patchSettings(partial);
}

export function sectionHasCustomReset(sectionId: string): boolean {
  return sectionId === "general.media" || sectionId === "keybinds.list";
}
