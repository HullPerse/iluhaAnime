import { useNavigate, useRouterState } from "@tanstack/react-router";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { saveWindowState } from "@tauri-apps/plugin-window-state";
import { useCallback, useEffect, useRef } from "react";

import { systemApi } from "@/api/system.api";
import { TOAST_ACTIVATED_EVENT } from "@/config/system/notifications.config";
import { visibleTabs } from "@/config/settings/tabs.config";
import { tabIdFromPath, tabPathFromId } from "@/config/settings/tabPaths.config";
import { useResolvedHotkeys } from "@/hooks/hotkeys.hook";
import type { ResolvedHotkeyDef } from "@/types/ui/hotkeys";
import { useI18n } from "@/hooks/i18n.hook";
import { usePrepareCardsPacks } from "@/hooks/cards/prepare.hook";
import { useLiveResource } from "@/hooks/liveResource.hook";
import { isOfflineDisabledTab, markOfflineTabs, useOnlineStatus } from "@/hooks/network.hook";
import { useTauriEvent } from "@/hooks/tauriEvent.hook";
import { useUpdateCheck } from "@/hooks/update.hook";
import {
  notifyAniListSummary,
  pollAniListReleases,
  pollSiteNotifications,
} from "@/lib/anilist/anilistNotifications.utils";
import { markCacheReady } from "@/lib/core/system/signals.utils";
import { useCell } from "@hullperse/hp_utils/react";
import { attemptSequence, reportBackgroundError } from "@hullperse/hp_utils/attempt";
import {
  DEEP_LINK_EVENT,
  ingestDeepLinks,
  isEditablePasteTarget,
  parsePastedLink,
} from "@/lib/core/system/deeplink.utils";
import type { PastedLink } from "@/lib/core/system/deeplink.utils";
import {
  openNotificationTarget,
  resolveNotificationText,
  showError,
  showWarning,
} from "@/lib/core/ui/notification.utils";
import {
  deeplinkAtoms,
  openAnimeDeepLink,
  openAuthDeepLink,
  openGiftDeepLink,
  openGiftReceiptDeepLink,
  openMagnetDeepLink,
  openNewsDeepLink,
  openStreamDeepLink,
  openTorrentDeepLink,
  subscribeDeepLink,
} from "@/store/deeplink.store";
import { addNotification } from "@/store/notification.store";
import {
  clearSearchAnimeIndex,
  hydrateSearchLearning,
  searchAtoms,
  subscribeSearch,
} from "@/store/search.store";
import { settingsAtoms, subscribeSettings } from "@/store/settings.store";
import { closeUpdatePrompt, openUpdatePrompt, updateAtoms } from "@/store/update.store";
import type {
  NotificationTarget,
  NotificationType,
  ShowNotificationPayload,
} from "@/types/core/notification";
import type { TabId } from "@/types/ui/settings";

const NOTIFICATION_TYPES = new Set<NotificationType>(["info", "success", "warning", "error"]);

export function useApp() {
  const { t } = useI18n();
  const isOnline = useOnlineStatus();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const goToTab = useCallback(
    (tab: TabId) => {
      navigate({ to: tabPathFromId(tab) });
    },
    [navigate]
  );

  const collectionTabEnabled = useCell(settingsAtoms.collectionTabEnabled);
  usePrepareCardsPacks(collectionTabEnabled);
  const anilistTabEnabled = useCell(settingsAtoms.anilistTabEnabled);
  const searchTabEnabled = useCell(settingsAtoms.searchTabEnabled);
  const torrentTabEnabled = useCell(settingsAtoms.torrentTabEnabled);
  const playerTabEnabled = useCell(settingsAtoms.playerTabEnabled);
  const streamTabEnabled = useCell(settingsAtoms.streamTabEnabled);
  const newsTabEnabled = useCell(settingsAtoms.newsTabEnabled);
  const gameTabUnlocked = useCell(settingsAtoms.gameTabUnlocked);
  const rememberLastTab = useCell(settingsAtoms.rememberLastTab);
  const urlTab = tabIdFromPath(pathname) ?? "search";
  const activeTab = rememberLastTab ? urlTab : "search";
  const enableAnimations = useCell(settingsAtoms.enableAnimations);
  const retroStyle = useCell(settingsAtoms.retroStyle);
  const uiDensity = useCell(settingsAtoms.uiDensity);
  const customScrollbar = useCell(settingsAtoms.customScrollbar);
  const anilistReleaseNotifications = useCell(settingsAtoms.anilistReleaseNotifications);
  const anilistPollIntervalMin = useCell(settingsAtoms.anilistPollIntervalMin);

  const tabs = markOfflineTabs(
    visibleTabs({
      collectionTabEnabled,
      anilistTabEnabled,
      searchTabEnabled,
      torrentTabEnabled,
      playerTabEnabled,
      streamTabEnabled,
      newsTabEnabled,
      gameTabUnlocked,
    }).map((tab) => ({
      ...tab,
      label: t(tab.key),
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
    const isUsable = tabs.some((tab) => tab.id === activeTab && !tab.disabled);
    if (isUsable || tabs.length === 0) return;
    const fallback = (tabs.find((tab) => !tab.disabled) ?? tabs[0]).id;
    if (fallback !== activeTab) goToTab(fallback);
  }, [activeTab, tabs, goToTab]);

  const isInitial = useRef<boolean>(true);
  useEffect(() => {
    if (!rememberLastTab && isInitial.current) {
      isInitial.current = false;
      if (urlTab !== "search") {
        goToTab("search");
      }
    }
  }, [rememberLastTab, urlTab, goToTab]);

  const altDigitDefs: ResolvedHotkeyDef<TabId>[] = visibleTabs({
    collectionTabEnabled,
    anilistTabEnabled,
    searchTabEnabled,
    torrentTabEnabled,
    playerTabEnabled,
    streamTabEnabled,
    newsTabEnabled,
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
  useTauriEvent<ShowNotificationPayload>(
    "show-notification",
    (event) => {
      const type = NOTIFICATION_TYPES.has(event.payload.type as NotificationType)
        ? (event.payload.type as NotificationType)
        : "info";
      const { title, body } = resolveNotificationText(event.payload);
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
    const error = await attemptSequence([
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
        (link) => {
          openAuthDeepLink(link);
        },
        (link) => {
          if (!settingsAtoms.streamTabEnabled.get()) {
            showError(t("common.error"), t("anilist.details.link.invalid"));
            return;
          }
          if (!isOnline) {
            showWarning(t("network.offline.title"), t("network.action.unavailable"));
            return;
          }
          openStreamDeepLink(link);
          goToTab("stream");
        },
        (link) => {
          if (!settingsAtoms.newsTabEnabled.get()) {
            showError(t("common.error"), t("anilist.details.link.invalid"));
            return;
          }
          if (!isOnline) {
            showWarning(t("network.offline.title"), t("network.action.unavailable"));
            return;
          }
          openNewsDeepLink(link);
          goToTab("news");
        },
        (link) => {
          if (!settingsAtoms.collectionTabEnabled.get()) {
            showError(t("common.error"), t("anilist.details.link.invalid"));
            return;
          }
          openGiftDeepLink(link);
          goToTab("collection");
        },
        (link) => {
          if (!settingsAtoms.collectionTabEnabled.get()) {
            showError(t("common.error"), t("anilist.details.link.invalid"));
            return;
          }
          openGiftReceiptDeepLink(link);
          goToTab("collection");
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
        return null;
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
    const ensureTab = (enabled: boolean): boolean => {
      if (!enabled) {
        showError(t("common.error"), t("anilist.details.link.invalid"));
        return false;
      }
      if (!isOnline) {
        showWarning(t("network.offline.title"), t("network.action.unavailable"));
        return false;
      }
      return true;
    };
    const ensureTorrentTab = (): boolean => {
      if (!settingsAtoms.torrentTabEnabled.get()) {
        showError(t("common.error"), t("anilist.details.link.invalid"));
        return false;
      }
      goToTab("torrent");
      return true;
    };
    const openGift = (link: Parameters<typeof openGiftDeepLink>[0]): void => {
      if (!settingsAtoms.collectionTabEnabled.get()) {
        showError(t("common.error"), t("anilist.details.link.invalid"));
        return;
      }
      goToTab("collection");
      openGiftDeepLink(link);
    };
    const openGiftReceipt = (
      link: Parameters<typeof openGiftReceiptDeepLink>[0]
    ): void => {
      if (!settingsAtoms.collectionTabEnabled.get()) {
        showError(t("common.error"), t("anilist.details.link.invalid"));
        return;
      }
      openGiftReceiptDeepLink(link);
      goToTab("collection");
    };
    const openGiftPasted = (
      link: Extract<PastedLink, { kind: "gift" | "gift-receipt" }>
    ): void => {
      if (link.kind === "gift") openGift(link.link);
      else openGiftReceipt(link.link);
    };
    const rejectInvalidPaste = (event: ClipboardEvent): void => {
      if (activeTab !== "anilist" && activeTab !== "torrent") return;
      event.preventDefault();
      showError(t("common.error"), t("anilist.details.link.invalid"));
    };
    const handler = (event: ClipboardEvent) => {
      if (event.defaultPrevented) return;
      if (isEditablePasteTarget(event.target)) return;
      const text = event.clipboardData?.getData("text") ?? "";
      const parsed = parsePastedLink(text);
      if (!parsed) return;        if (parsed === "invalid") {
          rejectInvalidPaste(event);
          return;
        }
      event.preventDefault();
      if (parsed.kind === "anime") {
        if (!ensureTab(settingsAtoms.anilistTabEnabled.get())) return;
        openAnimeDeepLink(parsed.link);
      } else if (parsed.kind === "stream") {
        if (!ensureTab(settingsAtoms.streamTabEnabled.get())) return;
        openStreamDeepLink(parsed.link);
        goToTab("stream");
      } else if (parsed.kind === "news") {
        if (!ensureTab(settingsAtoms.newsTabEnabled.get())) return;
        openNewsDeepLink(parsed.link);
        goToTab("news");
      } else if (parsed.kind === "gift" || parsed.kind === "gift-receipt") {
        openGiftPasted(parsed);
      } else if (parsed.kind === "torrent") {
        if (!ensureTorrentTab()) return;
        openTorrentDeepLink(parsed.link);
      } else if (parsed.kind === "magnet") {
        if (!ensureTorrentTab()) return;
        openMagnetDeepLink(parsed.magnet);
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
    const switchToStream = () => {
      if (!settingsAtoms.streamTabEnabled.get()) return;
      goToTab("stream");
    };
    if (deeplinkAtoms.streamTarget.get()) switchToStream();
    let previousStream = deeplinkAtoms.streamTarget.get();
    return subscribeDeepLink(() => {
      const next = deeplinkAtoms.streamTarget.get();
      if (next && next !== previousStream) switchToStream();
      previousStream = next;
    });
  }, [goToTab]);

  useEffect(() => {
    const switchToCollection = () => {
      if (!settingsAtoms.collectionTabEnabled.get()) return;
      goToTab("collection");
    };
    if (deeplinkAtoms.giftTarget.get()) switchToCollection();
    let previousGift = deeplinkAtoms.giftTarget.get();
    return subscribeDeepLink(() => {
      const next = deeplinkAtoms.giftTarget.get();
      if (next && next !== previousGift) switchToCollection();
      previousGift = next;
    });
  }, [goToTab]);

  useEffect(() => {
    const switchToNews = () => {
      if (!settingsAtoms.newsTabEnabled.get()) return;
      goToTab("news");
    };
    if (deeplinkAtoms.newsTarget.get()) switchToNews();
    let previousNews = deeplinkAtoms.newsTarget.get();
    return subscribeDeepLink(() => {
      const next = deeplinkAtoms.newsTarget.get();
      if (next && next !== previousNews) switchToNews();
      previousNews = next;
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

  const releaseCancelledRef = useRef<boolean>(false);
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
      const [releases, site] = await Promise.all([
        pollAniListReleases(t, () => releaseCancelledRef.current, {
          system: false,
          silent: true,
        }),
        pollSiteNotifications(t, () => releaseCancelledRef.current, {
          system: false,
          silent: true,
        }),
      ]);
      // One popup per poll: the individual rows went into the panel silently.
      notifyAniListSummary(releases.added + site.added, t, true);
      return releases.ok;
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
    clearSearchAnimeIndex();
    hydrateSearchLearning().catch((error) => reportBackgroundError("learning.hydrate", error));
    markCacheReady();
  }, []);

  return {
    tabs,
    update,
    updatePromptOpen,
    closeUpdatePrompt,
  };
}
