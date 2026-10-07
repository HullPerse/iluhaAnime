import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Update } from "@tauri-apps/plugin-updater";
import { saveWindowState } from "@tauri-apps/plugin-window-state";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { systemApi } from "@/api/system.api";
import { TOAST_ACTIVATED_EVENT } from "@/config/settings/notifications.config";
import { visibleTabs } from "@/config/settings/tabs.config";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useHotkeys } from "@/hooks/hotkeys.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { useLiveResource } from "@/hooks/liveResource.hook";
import { isOfflineDisabledTab, markOfflineTabs, useOnlineStatus } from "@/hooks/network.hook";
import { useTauriEvent } from "@/hooks/tauriEvent.hook";
import { pollAniListReleases, pollSiteNotifications } from "@/lib/anilist/notifications.utils";
import type { HotkeyDef } from "@/lib/hotkeys/chord.hotkeys";
import { queryKeys } from "@/lib/query/keys.utils";
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
import { useCell } from "@/lib/state/signal.hook";
import { checkForUpdates } from "@/lib/utils/update.utils";
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
import type {
  NotificationTarget,
  NotificationType,
  ShowNotificationPayload,
} from "@/types/notification";
import type { SearchLearningSnapshot } from "@/types/search";
import type { TabId } from "@/types/settings";
import type { FolderNode } from "@/types/torrent";

const NOTIFICATION_TYPES = new Set<NotificationType>(["info", "success", "warning", "error"]);

export function useApp(activeTab: TabId, setActiveTab: (t: TabId) => void) {
  const { t } = useI18n();
  const isOnline = useOnlineStatus();

  const collectionTabEnabled = useCell(settingsAtoms.collectionTabEnabled);
  const anilistTabEnabled = useCell(settingsAtoms.anilistTabEnabled);
  const searchTabEnabled = useCell(settingsAtoms.searchTabEnabled);
  const torrentTabEnabled = useCell(settingsAtoms.torrentTabEnabled);
  const playerTabEnabled = useCell(settingsAtoms.playerTabEnabled);
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
  const [isPending, startTransition] = useTransition();
  const setActiveTabTransition = useCallback(
    (tab: TabId) => startTransition(() => setActiveTab(tab)),
    [setActiveTab]
  );

  const [updateAvailable, setUpdateAvailable] = useState(false);
  const { data } = useAppQuery("static", {
    queryFn: async (): Promise<Update | null> => checkForUpdates(),
    queryKey: queryKeys.appUpdates(),
    enabled: isOnline,
  });

  const initTabsRef = useRef(false);

  useEffect(() => {
    if (data) {
      setUpdateAvailable(true);
      if (settingsAtoms.notifyUpdateAvailable.get()) {
        addNotification(
          t("updater.title"),
          "info",
          t("notification.update.available", { version: data.version }),
          `app-update:${data.version}`,
          { system: true }
        );
      }
    }
  }, [data, t]);

  const prevOnlineRef = useRef(isOnline);
  useEffect(() => {
    const prev = prevOnlineRef.current;
    if (prev === isOnline) return;
    prevOnlineRef.current = isOnline;
    if (!isOnline) {
      addNotification(t("network.offline.title"), "warning", t("network.offline.body"), "network-offline", {
        system: false,
      });
    } else {
      addNotification(t("network.online.title"), "info", t("network.online.body"), "network-online", {
        system: false,
      });
    }
  }, [isOnline, t]);

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
    const timer = setTimeout(() => {
      applyTheme(themeAtoms.currentTheme.get(), themeAtoms.customThemes.get());
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (activeTab === ("preview" as TabId)) return;
    if (!initTabsRef.current && tabs.length > 0) {
      initTabsRef.current = true;
      const target = tabs.find((tab) => !tab.disabled)?.id ?? tabs[0].id;
      if (target !== activeTab) startTransition(() => setActiveTab(target as TabId));
    }
  }, [activeTab, tabs, setActiveTab]);

  useEffect(() => {
    if (activeTab === ("preview" as TabId)) return;
    const isActiveUsable = tabs.some((x) => x.id === activeTab && !x.disabled);
    if (!isActiveUsable && tabs.length > 0) {
      const fallback = tabs.find((x) => !x.disabled) ?? tabs[0];
      startTransition(() => setActiveTab(fallback.id as TabId));
    }
  }, [activeTab, tabs, setActiveTab]);

  useEffect(() => {
    if (activeTab === ("preview" as TabId)) return;
    if (!collectionTabEnabled && activeTab === "collection")
      startTransition(() => setActiveTab("search"));
    if (!anilistTabEnabled && activeTab === "anilist")
      startTransition(() => setActiveTab("search"));
  }, [activeTab, collectionTabEnabled, anilistTabEnabled, setActiveTab]);

  const altDigitDefs: HotkeyDef<TabId>[] = visibleTabs({
    collectionTabEnabled,
    anilistTabEnabled,
    searchTabEnabled,
    torrentTabEnabled,
    playerTabEnabled,
  }).map((tab, index) => ({ id: tab.id, chord: `alt+Digit${index + 1}`, repeat: "once" }));

  useHotkeys<TabId>(altDigitDefs, {
    onAction: (tab) => {
      if (!isOnline && isOfflineDisabledTab(tab)) {
        showWarning(t("network.offline.title"), t("network.action.unavailable"));
        return;
      }
      startTransition(() => setActiveTab(tab));
    },
  });

  useEffect(() => {
    if (!isOnline) return;
    const current = searchAtoms.crossSearchQuery.get();
    if (current) startTransition(() => setActiveTab("search"));
    let previousCross = current;
    return subscribeSearch(() => {
      const next = searchAtoms.crossSearchQuery.get();
      if (next && next !== previousCross) startTransition(() => setActiveTab("search"));
      previousCross = next;
    });
  }, [isOnline, setActiveTab]);

  useEffect(() => {
    if (!isOnline) return;
    const current = searchAtoms.anilistSearchQuery.get();
    if (current && settingsAtoms.anilistTabEnabled.get())
      startTransition(() => setActiveTab("anilist"));
    let previousAnilist = current;
    return subscribeSearch(() => {
      const next = searchAtoms.anilistSearchQuery.get();
      if (next && next !== previousAnilist) {
        if (!settingsAtoms.anilistTabEnabled.get()) return;
        startTransition(() => setActiveTab("anilist"));
      }
      previousAnilist = next;
    });
  }, [isOnline, setActiveTab]);
  useEffect(() => {
    const switchToCollection = () => {
      if (!settingsAtoms.collectionTabEnabled.get()) return;
      startTransition(() => setActiveTab("collection"));
    };
    if (collectionAtoms.wizardPrefill.get()) switchToCollection();
    let previousPrefill = collectionAtoms.wizardPrefill.get();
    return subscribeCollection(() => {
      const next = collectionAtoms.wizardPrefill.get();
      if (next && next !== previousPrefill) switchToCollection();
      previousPrefill = next;
    });
  }, [setActiveTab]);

  useTauriEvent<ShowNotificationPayload>(
    "show-notification",
    (event) => {
      const type = NOTIFICATION_TYPES.has(event.payload.type as NotificationType)
        ? (event.payload.type as NotificationType)
        : "info";
      const { title, body } = resolveNotificationText(
        event.payload,
        settingsAtoms.language.get()
      );
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
          setActiveTabTransition("torrent");
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
    [isOnline, t, setActiveTabTransition]
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
      if (activeTab !== "torrent") setActiveTabTransition("torrent");
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
  }, [isOnline, t, activeTab, setActiveTabTransition]);
  useEffect(() => {
    const switchToAnilist = () => {
      if (!isOnline) return;
      if (!settingsAtoms.anilistTabEnabled.get()) return;
      startTransition(() => setActiveTab("anilist"));
    };
    if (deeplinkAtoms.target.get()) switchToAnilist();
    let previousTarget = deeplinkAtoms.target.get();
    return subscribeDeepLink(() => {
      const next = deeplinkAtoms.target.get();
      if (next && next !== previousTarget) switchToAnilist();
      previousTarget = next;
    });
  }, [isOnline, setActiveTab]);

  useEffect(() => {
    const switchToCollection = () => {
      if (!settingsAtoms.collectionTabEnabled.get()) return;
      startTransition(() => setActiveTab("collection"));
    };
    if (deeplinkAtoms.shareTarget.get()) switchToCollection();
    let previousShare = deeplinkAtoms.shareTarget.get();
    return subscribeDeepLink(() => {
      const next = deeplinkAtoms.shareTarget.get();
      if (next && next !== previousShare) switchToCollection();
      previousShare = next;
    });
  }, [setActiveTab]);

  useEffect(() => {
    const switchToAnilist = () => {
      if (!isOnline) return;
      if (!settingsAtoms.anilistTabEnabled.get()) return;
      startTransition(() => setActiveTab("anilist"));
    };
    if (deeplinkAtoms.authTarget.get()) switchToAnilist();
    let previousAuth = deeplinkAtoms.authTarget.get();
    return subscribeDeepLink(() => {
      const next = deeplinkAtoms.authTarget.get();
      if (next && next !== previousAuth) switchToAnilist();
      previousAuth = next;
    });
  }, [isOnline, setActiveTab]);

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
      const notificationsEnabled = settingsAtoms.notificationsEnabled.get();
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
      return { notificationsEnabled, notifyOnComplete, notifyOnError, notifyTorrentHealth };
    };
    let previous = sync();
    return subscribeSettings(() => {
      const current = {
        notificationsEnabled: settingsAtoms.notificationsEnabled.get(),
        notifyOnComplete: settingsAtoms.notifyOnComplete.get(),
        notifyOnError: settingsAtoms.notifyOnError.get(),
        notifyTorrentHealth: settingsAtoms.notifyTorrentHealth.get(),
      };
      if (
        current.notificationsEnabled !== previous.notificationsEnabled ||
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
    ]).then(([folderTrees, lastSaveDir, seedPreferences, episodeTracker, learning]) => {
      if (disposed) return;
      if (folderTrees?.payload) setFolderTrees(folderTrees.payload);
      if (lastSaveDir?.payload) {
        setLastSaveDir(lastSaveDir.payload);
      }
      if (seedPreferences?.payload)
        cacheAtoms.seedPreferences.set(seedPreferences.payload);
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
    });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    let timer: number | undefined;
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
        if (timer !== undefined) window.clearTimeout(timer);
        timer = window.setTimeout(saveLearning, 2000);
      }
    });
    return () => {
      unsubscribe();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  return {
    tabs,
    isPending,
    setActiveTabTransition,
    data,
    updateAvailable,
    setUpdateAvailable,
  };
}
