import * as z from "zod/mini";

import { listSortKeys } from "@/config/anilist/list.config";
import { SOURCE_INFOS } from "@/config/search/searchSources.config";
import {
  DEFAULT_SETTINGS,
  DEFAULT_WALLPAPER_SHADOW,
} from "@/config/settings/settingsDefaults.config";
import { STREAM_QUALITIES } from "@/config/player/quality.config";
import { DITHER_PLACEHOLDER_ID } from "@/config/graphics/dither.config";
import { isRecord } from "@/lib/core/text/record.utils";
import type { MigrationTransform } from "@/types/core/migrate";
import { resolveWithDefaults, runTransforms } from "@/lib/core/persistence/migrate.utils";
import { attemptSync, reportBackgroundError } from "@hullperse/hp_utils/attempt";
import { toValidator } from "@/lib/core/persistence/schema.utils";
import type { SettingsData } from "@/types/store/settings";

const LIST_SORT_KEY_SET: ReadonlySet<string> = new Set(listSortKeys);

const SETTINGS_TRANSFORMS: MigrationTransform[] = [
  {
    migrate: (state) => {
      const inlineOff = state.inlineAutocompleteEnabled === false;
      delete state.inlineAutocompleteEnabled;
      delete state.vaultTabEnabled;
      if (inlineOff) state.autocompleteMode = "off";
    },
  },
  {
    from: 10,
    migrate: (state) => {
      delete state.defaultTab;
      delete state.lastActiveTab;
      const [, error] = attemptSync(() => localStorage.removeItem("lastActiveTab"));
      if (error !== null) reportBackgroundError("settings.migrate.cleanup", error);
    },
  },
  {
    from: 11,
    migrate: (state) => {
      delete state.toastDuration;
    },
  },
  {
    from: 12,
    migrate: (state) => {
      delete state.searchDedupEnabled;
    },
  },
  {
    from: 15,
    migrate: (state) => {
      if (state.limits === undefined) {
        const download = state.dlLimit;
        const upload = state.ulLimit;
        state.limits = {
          download: typeof download === "number" ? download : null,
          upload: typeof upload === "number" ? upload : null,
        };
      }
      delete state.dlLimit;
      delete state.ulLimit;
    },
  },
  {
    from: 20,
    migrate: (state) => {
      const legacy = isRecord(state.wallpaperShadow) ? state.wallpaperShadow : null;
      const sides = { top: false, right: false, bottom: false, left: false };
      if (legacy) {
        if (legacy.side === "around") {
          sides.top = true;
          sides.right = true;
          sides.bottom = true;
          sides.left = true;
        } else {
          const side = legacy.side;
          if (side === "top" || side === "right" || side === "bottom" || side === "left") {
            sides[side] = true;
          }
        }
      }
      if (state.searchShadow === undefined) {
        state.searchShadow = {
          sides,
          intensity: typeof legacy?.intensity === "number" ? legacy.intensity : 50,
          color: typeof legacy?.color === "string" ? legacy.color : "#000000",
          length: DEFAULT_WALLPAPER_SHADOW.length,
          softness: DEFAULT_WALLPAPER_SHADOW.softness,
        };
      }
      delete state.wallpaperShadow;
    },
  },
  {
    from: 23,
    migrate: (state) => {
      const legacy = state.tmdbApiKey;
      delete state.tmdbApiKey;
      if (typeof legacy === "string" && legacy.trim()) {
        state.tmdbPendingKey = legacy.trim();
      }
    },
  },
  {
    from: 25,
    migrate: (state) => {
      delete state.wallpaperParallax;
    },
  },
  {
    from: 36,
    migrate: (state) => {
      delete state.lobbyTabEnabled;
      delete state.chatImagePreviews;
    },
  },
  {
    from: 38,
    migrate: (state) => {
      if (state.parseTitlesPlayer === undefined) {
        state.parseTitlesPlayer = state.parseTitles === true;
      }
      if (state.parseTitlesTorrent === undefined) state.parseTitlesTorrent = false;
      if (state.parseTitlesSearch === undefined) state.parseTitlesSearch = false;
      delete state.parseTitles;
    },
  },
  {
    from: 39,
    migrate: (state) => {
      const schedule = state.themeSchedule;
      if (isRecord(schedule)) schedule.enabled = false;
    },
  },
  {
    from: 40,
    migrate: (state) => {
      if (state.selectedDitherId === DITHER_PLACEHOLDER_ID) state.selectedDitherId = null;
    },
  },
  {
    from: 41,
    migrate: (state) => {
      delete state.thumbPreviews;
      delete state.spriteBurstMpv;
      delete state.spriteFillPlayback;
      delete state.spriteNeighborCount;
    },
  },
  {
    from: 43,
    migrate: (state) => {
      const order: string[] = SOURCE_INFOS.map((info) => info.value);
      const rank = new Map(order.map((value, index): [string, number] => [value, index]));
      if (Array.isArray(state.visibleSources)) {
        const kept = state.visibleSources.filter(
          (value): value is string => typeof value === "string"
        );
        state.visibleSources = [
          ...order.filter((value) => kept.includes(value)),
          ...kept.filter((value) => !rank.has(value)),
        ];
      }
      if (state.defaultSearchSource === "erai-raws") state.defaultSearchSource = "rutracker";
    },
  },
  {
    from: 44,
    migrate: (state) => {
      const legacy = state.torrentCoversEnabled;
      delete state.torrentCoversEnabled;
      if (state.torrentCoverMode === undefined) {
        state.torrentCoverMode = legacy === true ? "full" : "off";
      }
      if (state.torrentCoverModeManual === undefined) {
        state.torrentCoverModeManual = legacy === true;
      }
    },
  },
  {
    from: 49,
    migrate: (state) => {
      if (state.playerType === undefined) {
        state.playerType = "default";
      }
    },
  },
  {
    from: 50,
    migrate: (state) => {
      if (state.playerContextMenu === undefined) {
        state.playerContextMenu = false;
      }
    },
  },
  {
    from: 51,
    migrate: (state) => {
      if (state.notificationPopups === undefined) {
        state.notificationPopups = state.notificationsEnabled === true ? "both" : "off";
      }
      delete state.notificationsEnabled;
    },
  },
  {
    from: 52,
    migrate: (state) => {
      if (state.gameTabUnlocked === undefined) {
        state.gameTabUnlocked = false;
      }
    },
  },
  {
    from: 53,
    migrate: (state) => {
      if (state.gameVolume === undefined) {
        state.gameVolume = 1;
      }
    },
  },
  {
    from: 54,
    migrate: (state) => {
      delete state.notifyUpdateAvailable;
    },
  },
  {
    from: 55,
    migrate: (state) => {
      if (state.rememberLastTab === undefined) {
        state.rememberLastTab = true;
      }
    },
  },
  {
    from: 58,
    migrate: (state) => {
      if (state.streamDefaultQuality === undefined) {
        state.streamDefaultQuality = DEFAULT_SETTINGS.streamDefaultQuality;
      }
    },
  },
  {
    from: 59,
    migrate: (state) => {
      if (state.discordRpcEnabled === undefined) {
        state.discordRpcEnabled = false;
      }
    },
  },
  {
    from: 60,
    migrate: (state) => {
      const pageSize = state.pageSize;
      if (state.anilistPageSize === undefined) {
        state.anilistPageSize =
          typeof pageSize === "number" ? pageSize : DEFAULT_SETTINGS.anilistPageSize;
      }
      delete state.pageSize;
      const resultsPerPage = state.resultsPerPage;
      if (state.searchResultsPerPage === undefined) {
        state.searchResultsPerPage =
          typeof resultsPerPage === "number"
            ? resultsPerPage
            : DEFAULT_SETTINGS.searchResultsPerPage;
      }
      delete state.resultsPerPage;
    },
  },
];

const SETTINGS_VALIDATORS: Record<string, (value: unknown) => boolean> = {
  searchType: toValidator(z.enum(["default", "modern"])),
  playerType: toValidator(z.enum(["default", "modern"])),
  progressStyle: toValidator(z.enum(["blocks", "solid"])),
  similarView: toValidator(z.enum(["rail", "list"])),
  animeDetailWidth: toValidator(z.enum(["default", "wide"])),
  screenshotFormat: toValidator(z.enum(["png", "jpeg"])),
  torrentCoverMode: toValidator(z.enum(["off", "pages", "full"])),
  notificationPopups: toValidator(z.enum(["off", "system", "inapp", "both"])),
  anilistDisplayMode: toValidator(z.enum(["scroll", "pagination"])),
  watcherDelay: toValidator(z.enum(["fast", "calm"])),
  streamDefaultQuality: toValidator(z.enum(STREAM_QUALITIES)),
  scanThreads: (value) =>
    typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 64,
  gameVolume: (value) => typeof value === "number" && value >= 0 && value <= 1,
  searchProxyUrls: toValidator(z.record(z.string(), z.string())),
  playerFolderHeights: toValidator(z.record(z.string(), z.number())),
  playerTorrentHeights: toValidator(z.record(z.string(), z.number())),
  keybindOverrides: toValidator(z.record(z.string(), z.union([z.string(), z.null()]))),
  anilistListSort: toValidator(
    z.object({
      key: z.string().check(z.refine((value) => LIST_SORT_KEY_SET.has(value))),
      dir: z.enum(["asc", "desc"]),
    })
  ),
  limits: toValidator(
    z.object({
      download: z.union([z.number(), z.null()]),
      upload: z.union([z.number(), z.null()]),
    })
  ),
  speedSchedule: toValidator(
    z.object({
      enabled: z.boolean(),
      dayStart: z.string(),
      nightStart: z.string(),
      dayDownload: z.union([z.number(), z.null()]),
      dayUpload: z.union([z.number(), z.null()]),
      nightDownload: z.union([z.number(), z.null()]),
      nightUpload: z.union([z.number(), z.null()]),
    })
  ),
  listenPort: (value) =>
    typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 65535,
  httpApiPort: (value) =>
    typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 65535,
  peerConnectTimeout: (value) => typeof value === "number" && Number.isInteger(value) && value > 0,
  peerReadWriteTimeout: (value) =>
    typeof value === "number" && Number.isInteger(value) && value > 0,
  maxConcurrentDownloads: (value) =>
    typeof value === "number" && Number.isInteger(value) && value > 0,
  anilistPageSize: (value) => typeof value === "number" && Number.isInteger(value) && value > 0,
  searchResultsPerPage: (value) =>
    typeof value === "number" && Number.isInteger(value) && value > 0,
  defaultDownloadDir: (value) => value === null || typeof value === "string",
  screenshotDir: (value) => value === null || typeof value === "string",
  modalBackdropOpacity: (value) => typeof value === "number" && value >= 0 && value <= 100,
  windowTintOpacity: (value) =>
    value === null || (typeof value === "number" && value >= 0 && value <= 100),
  anilistPollIntervalMin: (value) =>
    typeof value === "number" && Number.isInteger(value) && value > 0,
};

export function migrateSettingsData(
  persistedState: unknown,
  version: number,
  fallbackLanguage: "en" | "ru" = "ru"
): SettingsData {
  if (!isRecord(persistedState)) return { ...DEFAULT_SETTINGS, language: fallbackLanguage };
  const { language, ...rest } = persistedState;
  const transformed = runTransforms(rest, version, SETTINGS_TRANSFORMS);
  const resolved = resolveWithDefaults(transformed, { ...DEFAULT_SETTINGS }, SETTINGS_VALIDATORS);
  return {
    ...DEFAULT_SETTINGS,
    ...resolved,
    language: language === "en" ? "en" : fallbackLanguage,
  };
}
