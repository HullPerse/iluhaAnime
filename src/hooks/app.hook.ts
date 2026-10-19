import { useNavigate, useRouterState } from "@tanstack/react-router";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { saveWindowState } from "@tauri-apps/plugin-window-state";
import { useCallback, useEffect, useRef } from "react";

import { systemApi } from "@/api/system.api";
import { TOAST_ACTIVATED_EVENT } from "@/config/settings/notifications.config";
import { visibleTabs } from "@/config/settings/tabs.config";
import { tabIdFromPath, tabPathFromId } from "@/config/tabs/paths.config";
import { useResolvedHotkeys } from "@/hooks/hotkeys.hook";
import type { ResolvedHotkeyDef } from "@/hooks/hotkeys.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { useLiveResource } from "@/hooks/liveResource.hook";
import { isOfflineDisabledTab, markOfflineTabs, useOnlineStatus } from "@/hooks/network.hook";
import { useTauriEvent } from "@/hooks/tauriEvent.hook";
import { useUpdateCheck } from "@/hooks/update.hook";
import { pollAniListReleases, pollSiteNotifications } from "@/lib/anilist/notifications.utils";
import { Debouncer } from "@/lib/pacer/debounce.utils";
import { scheduleTask } from "@/lib/pacer/shared.utils";
import { markCacheReady } from "@/lib/splash/signals.utils";
import { useCell } from "@/lib/state/signal.hook";
import { readAppCache, writeAppCache } from "@/lib/store/cache.utils";
import { attemptAll, reportBackgroundError } from "@/lib/utils/attempt.utils";
import {
  DEEP_LINK_EVENT,
  ingestDeepLinks,
  isEditablePasteTarget,
  parseCollectionShareLink,
  parsePastedLink,
} from "@/lib/utils/deeplink.utils";
import {
  openNotificationTarget,
  resolveNotificationText,
  showError,
  showWarning,
} from "@/lib/utils/notification.utils";
import { anilistNotificationsAtoms } from "@/store/anilist.store";
import { cacheAtoms, setEpisodeTracker, setFolderTrees, setLastSaveDir } from "@/store/cache.store";
import { collectionAtoms, subscribeCollection } from "@/store/collection.store";
import {
  deeplinkAtoms,
  openAnimeDeepLink,
  openAuthDeepLink,
  openMagnetDeepLink,
  openShareDeepLink,
  openTorrentDeepLink,
  subscribeDeepLink,
} from "@/store/deeplink.store";
import { addNotification } from "@/store/notification.store";
import { clearSearchAnimeIndex, searchAtoms, subscribeSearch } from "@/store/search.store";
import { settingsAtoms, subscribeSettings } from "@/store/settings.store";
import { applyTheme, themeAtoms } from "@/store/theme.store";
import { closeUpdatePrompt, openUpdatePrompt, updateAtoms } from "@/store/update.store";
import type {
  NotificationTarget,
  NotificationType,
  ShowNotificationPayload,
} from "@/types/notification";
import type { SearchLearningSnapshot } from "@/types/search";
import type { TabId } from "@/types/settings";
import type { FolderNode } from "@/types/torrent";

const NOTIFICATION_TYPES = new Set<NotificationType>(["info", "success", "warning", "error"]);

export function useApp() {
  const { t } = useI18n();
  const isOnline = useOnlineStatus();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const activeTab = tabIdFromPath(pathname) ?? "search";
  const goToTab = useCallback(
    (tab: TabId) => {
      navigate({ to: tabPathFromId(tab) });
    },
    [navigate]
  );

  const collectionTabEnabled = useCell(settingsAtoms.collectionTabEnabled);
  const anilistTabEnabled = useCell(settingsAtoms.anilistTabEnabled);
  const searchTabEnabled = useCell(settingsAtoms.searchTabEnabled);
  const torrentTabEnabled = useCell(settingsAtoms.torrentTabEnabled);
  const playerTabEnabled = useCell(settingsAtoms.playerTabEnabled);
  const gameTabUnlocked = useCell(settingsAtoms.gameTabUnlocked);
  const enableAnimations = useCell(settingsAtoms.enableAnimations);
  const retroStyle = useCell(settingsAtoms.retroStyle);
  const uiDensity = useCell(settingsAtoms.uiDensity);
  const customScrollbar = useCell(settingsAtoms.customScrollbar);
  const anilistReleaseNotifications = useCell(settingsAtoms.anilistReleaseNotifications);
  const anilistPollIntervalMin = useCell(settingsAtoms.anilistPollIntervalMin);

  const unreadReleases = useCell(anilistNotificationsAtoms.releases).reduce(
    (count, item) => count + (item.read ? 0 : 1),
    0
  );

  const tabs = markOfflineTabs(
    visibleTabs({
      collectionTabEnabled,
      anilistTabEnabled,
      searchTabEnabled,
      torrentTabEnabled,
      playerTabEnabled,
      gameTabUnlocked,
    }).map((tab) => ({
      ...tab,
      label: t(tab.key),
      badge: tab.id === "anilist" ? unreadReleases : undefined,
    })),
    isOnline
  ).map((tab) => ({
    ...tab,
    disabledReason: tab.disabled ? t("tabs.offlineUnavailable") : undefined,
  }));
  const { data: update } = useUpdateCheck();
  const updatePromptOpen = useCell(updateAtoms.promptOpen);

  useEffect(() => {
    if (update) openUpdatePrompt();
  }, [update]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("no-animations", !enableAnimations);
    root.dataset.retroStyle = retroStyle;
    root.dataset.uiDensity = uiDensity;
  }, [enableAnimations, retroStyle, uiDensity]);

  useEffect(() => {
    document.documentElement.classList.toggle("native-scrollbar", !customScrollbar);
  }, [customScrollbar]);

  useEffect(() => {
    const save = () => {
      saveWindowState().catch((error) => reportBackgroundError("window-state.save", error));
    };
    window.addEventListener("beforeunload", save);
    document.addEventListener("visibilitychange", save);
    return () => {
      window.removeEventListener("beforeunload", save);
      document.removeEventListener("visibilitychange", save);
    };
  }, []);

  useEffect(() => {
    const task = scheduleTask("timeout", 0, () => {
      applyTheme(themeAtoms.currentTheme.get(), themeAtoms.customThemes.get());
    });
    return () => task.cancel();
  }, []);

  useEffect(() => {
    const isUsable = tabs.some((tab) => tab.id === activeTab && !tab.disabled);
    if (isUsable || tabs.length === 0) return;
    const fallback = (tabs.find((tab) => !tab.disabled) ?? tabs[0]).id;
    if (fallback !== activeTab) goToTab(fallback);
  }, [activeTab, tabs, goToTab]);

  const altDigitDefs: ResolvedHotkeyDef<TabId>[] = visibleTabs({
    collectionTabEnabled,
    anilistTabEnabled,
    searchTabEnabled,
    torrentTabEnabled,
    playerTabEnabled,
    gameTabUnlocked,
  }).map((tab, index) => ({
    id: tab.id,
    chord: `alt+Digit${index + 1}`,
    repeat: "once",
    keybindId: `tab.${tab.id}`,
  }));

  useResolvedHotkeys<TabId>(altDigitDefs, {
    onAction: (tab) => {
      if (!isOnline && isOfflineDisabledTab(tab)) {
        showWarning(t("network.offline.title"), t("network.action.unavailable"));
        return;
      }
      goToTab(tab);
    },
  });

  useEffect(() => {
    if (!isOnline) return;
    const current = searchAtoms.crossSearchQuery.get();
    if (current) goToTab("search");
    let previousCross = current;
    return subscribeSearch(() => {
      const next = searchAtoms.crossSearchQuery.get();
      if (next && next !== previousCross) goToTab("search");
      previousCross = next;
    });
  }, [isOnline, goToTab]);

  useEffect(() => {
    if (!isOnline) return;
    const current = searchAtoms.anilistSearchQuery.get();
    if (current && settingsAtoms.anilistTabEnabled.get()) goToTab("anilist");
    let previousAnilist = current;
    return subscribeSearch(() => {
      const next = searchAtoms.anilistSearchQuery.get();
      if (next && next !== previousAnilist) {
        if (!settingsAtoms.anilistTabEnabled.get()) return;
        goToTab("anilist");
      }
      previousAnilist = next;
    });
  }, [isOnline, goToTab]);
  useEffect(() => {
    const switchToCollection = () => {
      if (!settingsAtoms.collectionTabEnabled.get()) return;
      goToTab("collection");
    };
    if (collectionAtoms.wizardPrefill.get()) switchToCollection();
    let previousPrefill = collectionAtoms.wizardPrefill.get();
    return subscribeCollection(() => {
      const next = collectionAtoms.wizardPrefill.get();
      if (next && next !== previousPrefill) switchToCollection();
      previousPrefill = next;
    });
  }, [goToTab]);

  useTauriEvent<ShowNotificationPayload>(
    "show-notification",
    (event) => {
      const type = NOTIFICATION_TYPES.has(event.payload.type as NotificationType)
        ? (event.payload.type as NotificationType)
        : "info";
      const { title, body } = resolveNotificationText(event.payload, settingsAtoms.language.get());
      addNotification(title, type, body, event.payload.eventKey, { target: event.payload.action });
    },
    { errorTag: "notifications" }
  );

  const openTarget = async (target: NotificationTarget) => {
    const result = await openNotificationTarget(target);
    if (result === "tab-disabled") {
      showError(t("common.error"), t("anilist.details.link.invalid"));
      return;
    }
    if (result !== "opened") return;
    const appWindow = getCurrentWindow();
    const error = await attemptAll([
      () => appWindow.show(),
      () => appWindow.unminimize(),
      () => appWindow.setFocus(),
    ]);
    if (error) reportBackgroundError("notification.activation.focus", error);
  };

  useTauriEvent<NotificationTarget>(
    TOAST_ACTIVATED_EVENT,
    (event) => {
      openTarget(event.payload);
    },
    { errorTag: "notification.activation" }
  );

  const ingest = useCallback(
    (urls: unknown) => {
      ingestDeepLinks(
        urls,
        (link) => {
          if (!isOnline) {
            showWarning(t("network.offline.title"), t("network.action.unavailable"));
            return;
          }
          openAnimeDeepLink(link);
        },
        () => showError(t("common.error"), t("anilist.details.link.invalid")),
        (link) => {
          if (!settingsAtoms.torrentTabEnabled.get()) {
            showError(t("common.error"), t("anilist.details.link.invalid"));
            return;
          }
          openTorrentDeepLink(link);
          goToTab("torrent");
        },
        (rawUrl) => {
          if (!settingsAtoms.collectionTabEnabled.get()) {
            showError(t("common.error"), t("anilist.details.link.invalid"));
            return;
          }
          parseCollectionShareLink(rawUrl)
            .then((link) => {
              if (link) openShareDeepLink(link);
              else showError(t("common.error"), t("collection.share.invalid"));
            })
            .catch((error) => reportBackgroundError("deeplink.share-pending", error));
        },
        (link) => {
          openAuthDeepLink(link);
        }
      );
    },
    [isOnline, t, goToTab]
  );

  useEffect(() => {
    let disposed = false;
    systemApi
      .takePendingDeepLinks()
      .then((urls) => {
        if (!disposed) ingest(urls);
      })
      .catch((error) => reportBackgroundError("deeplink.take-pending", error));
    return () => {
      disposed = true;
    };
  }, [ingest]);

  useTauriEvent<string[]>(
    DEEP_LINK_EVENT,
    (event) => {
      ingest(event.payload);
    },
    { errorTag: "deeplink" }
  );

  useEffect(() => {
    const ensureTorrentTab = (): boolean => {
      if (!settingsAtoms.torrentTabEnabled.get()) {
        showError(t("common.error"), t("anilist.details.link.invalid"));
        return false;
      }
      goToTab("torrent");
      return true;
    };
    const handler = (event: ClipboardEvent) => {
      if (event.defaultPrevented) return;
      if (isEditablePasteTarget(event.target)) return;
      const text = event.clipboardData?.getData("text") ?? "";
      const parsed = parsePastedLink(text);
      if (!parsed) return;
      if (parsed === "invalid") {
        if (activeTab === "anilist" || activeTab === "torrent") {
          event.preventDefault();
          showError(t("common.error"), t("anilist.details.link.invalid"));
        }
        return;
      }
      event.preventDefault();
      if (parsed.kind === "anime") {
        if (!settingsAtoms.anilistTabEnabled.get()) {
          showError(t("common.error"), t("anilist.details.link.invalid"));
          return;
        }
        if (!isOnline) {
          showWarning(t("network.offline.title"), t("network.action.unavailable"));
          return;
        }
        openAnimeDeepLink(parsed.link);
      } else if (parsed.kind === "torrent") {
        if (!ensureTorrentTab()) return;
        openTorrentDeepLink(parsed.link);
      } else if (parsed.kind === "magnet") {
        if (!ensureTorrentTab()) return;
        openMagnetDeepLink(parsed.magnet);
      } else {
        if (!settingsAtoms.collectionTabEnabled.get()) {
          showError(t("common.error"), t("anilist.details.link.invalid"));
          return;
        }
        parseCollectionShareLink(text)
          .then((link) => {
            if (link) openShareDeepLink(link);
            else showError(t("common.error"), t("collection.share.invalid"));
          })
          .catch((error) => reportBackgroundError("deeplink.share-paste", error));
      }
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [isOnline, t, activeTab, goToTab]);
  useEffect(() => {
    const switchToAnilist = () => {
      if (!isOnline) return;
      if (!settingsAtoms.anilistTabEnabled.get()) return;
      goToTab("anilist");
    };
    if (deeplinkAtoms.target.get()) switchToAnilist();
    let previousTarget = deeplinkAtoms.target.get();
    return subscribeDeepLink(() => {
      const next = deeplinkAtoms.target.get();
      if (next && next !== previousTarget) switchToAnilist();
      previousTarget = next;
    });
  }, [isOnline, goToTab]);

  useEffect(() => {
    const switchToCollection = () => {
      if (!settingsAtoms.collectionTabEnabled.get()) return;
      goToTab("collection");
    };
    if (deeplinkAtoms.shareTarget.get()) switchToCollection();
    let previousShare = deeplinkAtoms.shareTarget.get();
    return subscribeDeepLink(() => {
      const next = deeplinkAtoms.shareTarget.get();
      if (next && next !== previousShare) switchToCollection();
      previousShare = next;
    });
  }, [goToTab]);

  useEffect(() => {
    const switchToAnilist = () => {
      if (!isOnline) return;
      if (!settingsAtoms.anilistTabEnabled.get()) return;
      goToTab("anilist");
    };
    if (deeplinkAtoms.authTarget.get()) switchToAnilist();
    let previousAuth = deeplinkAtoms.authTarget.get();
    return subscribeDeepLink(() => {
      const next = deeplinkAtoms.authTarget.get();
      if (next && next !== previousAuth) switchToAnilist();
      previousAuth = next;
    });
  }, [isOnline, goToTab]);

  const releaseSignature = `${anilistReleaseNotifications}:${anilistPollIntervalMin}:${anilistTabEnabled}`;
  const prevReleaseSignatureRef = useRef(releaseSignature);
  const firstReleasePollRef = useRef(true);
  const releaseCancelledRef = useRef(false);
  useEffect(
    () => () => {
      releaseCancelledRef.current = true;
    },
    []
  );
  useLiveResource({
    intervalMs: Math.max(1, anilistPollIntervalMin) * 60 * 1000,
    enabled: anilistReleaseNotifications && anilistTabEnabled && isOnline,
    collectKeys: () => ["anilist-releases"],
    shouldFetch: () => true,
    fetch: async () => {
      if (prevReleaseSignatureRef.current !== releaseSignature) {
        prevReleaseSignatureRef.current = releaseSignature;
        firstReleasePollRef.current = true;
      }
      const ok = await pollAniListReleases(t, () => releaseCancelledRef.current, {
        system: !firstReleasePollRef.current,
      });
      await pollSiteNotifications(t, () => releaseCancelledRef.current, {
        system: !firstReleasePollRef.current,
      });
      if (ok) firstReleasePollRef.current = false;
      return ok;
    },
  });

  useEffect(() => {
    const sync = () => {
      const popupMode = settingsAtoms.notificationPopups.get();
      const notificationsEnabled = popupMode !== "off";
      const notifyOnComplete = settingsAtoms.notifyOnComplete.get();
      const notifyOnError = settingsAtoms.notifyOnError.get();
      const notifyTorrentHealth = settingsAtoms.notifyTorrentHealth.get();
      systemApi
        .setNotificationSettings(
          notificationsEnabled,
          notifyOnComplete,
          notifyOnError,
          notifyTorrentHealth
        )
        .catch((error) => reportBackgroundError("notification-settings.sync", error));
      return { popupMode, notifyOnComplete, notifyOnError, notifyTorrentHealth };
    };
    let previous = sync();
    return subscribeSettings(() => {
      const current = {
        popupMode: settingsAtoms.notificationPopups.get(),
        notifyOnComplete: settingsAtoms.notifyOnComplete.get(),
        notifyOnError: settingsAtoms.notifyOnError.get(),
        notifyTorrentHealth: settingsAtoms.notifyTorrentHealth.get(),
      };
      if (
        current.popupMode !== previous.popupMode ||
        current.notifyOnComplete !== previous.notifyOnComplete ||
        current.notifyOnError !== previous.notifyOnError ||
        current.notifyTorrentHealth !== previous.notifyTorrentHealth
      ) {
        previous = sync();
      }
    });
  }, []);

  useEffect(() => {
    let disposed = false;
    clearSearchAnimeIndex();
    Promise.all([
      readAppCache<{ path: string; tree: FolderNode }[]>("player", "folderTrees"),
      readAppCache<string>("torrent", "lastSaveDir"),
      readAppCache<Record<number, boolean>>("torrent", "seedPreferences"),
      readAppCache<Record<number, number>>("player", "episodeTracker"),
      readAppCache<SearchLearningSnapshot>("search", "learning"),
    ])
      .then(([folderTrees, lastSaveDir, seedPreferences, episodeTracker, learning]) => {
        if (disposed) return;
        if (folderTrees?.payload) setFolderTrees(folderTrees.payload);
        if (lastSaveDir?.payload) {
          setLastSaveDir(lastSaveDir.payload);
        }
        if (seedPreferences?.payload) cacheAtoms.seedPreferences.set(seedPreferences.payload);
        if (episodeTracker?.payload) setEpisodeTracker(episodeTracker.payload);
        if (learning?.payload) {
          const ttlMs = 90 * 24 * 60 * 60 * 1000;
          const now = Date.now();
          const isExpired = (stat: { lastUsedAt: number }) => now - stat.lastUsedAt > ttlMs;
          const filterStats = <T extends Record<string, { lastUsedAt: number }>>(stats: T): T => {
            const out: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(stats ?? {})) {
              if (!isExpired(v as { lastUsedAt: number })) out[k] = v;
            }
            return out as T;
          };
          searchAtoms.history.set(learning.payload.history ?? []);
          searchAtoms.queryStats.set(filterStats(learning.payload.queryStats ?? {}));
          searchAtoms.suggestionStats.set(filterStats(learning.payload.suggestionStats ?? {}));
        }
        markCacheReady();
      })
      .catch((error: unknown) => {
        reportBackgroundError("cache.hydrate", error);
        markCacheReady();
      });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    const saveLearning = () => {
      const history = searchAtoms.history.get();
      const queryStats = searchAtoms.queryStats.get();
      const suggestionStats = searchAtoms.suggestionStats.get();
      const snapshot: SearchLearningSnapshot = {
        version: 1,
        history,
        queryStats,
        suggestionStats,
      };
      const run = () => {
        writeAppCache("search", "learning", snapshot).catch((error) =>
          reportBackgroundError("learning.persist", error)
        );
      };
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(run, { timeout: 2000 });
      } else {
        run();
      }
    };
    let previousLearning = {
      history: searchAtoms.history.get(),
      queryStats: searchAtoms.queryStats.get(),
      suggestionStats: searchAtoms.suggestionStats.get(),
    };
    const saveSoon = new Debouncer(() => saveLearning(), { wait: 2000 });
    const unsubscribe = subscribeSearch(() => {
      const current = {
        history: searchAtoms.history.get(),
        queryStats: searchAtoms.queryStats.get(),
        suggestionStats: searchAtoms.suggestionStats.get(),
      };
      if (
        current.history !== previousLearning.history ||
        current.queryStats !== previousLearning.queryStats ||
        current.suggestionStats !== previousLearning.suggestionStats
      ) {
        previousLearning = current;
        saveSoon.maybeExecute();
      }
    });
    return () => {
      unsubscribe();
      saveSoon.cancel();
    };
  }, []);

  return {
    tabs,
    update,
    updatePromptOpen,
    closeUpdatePrompt,
  };
}
