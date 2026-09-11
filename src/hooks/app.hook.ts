import { useQuery } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import type { Update } from "@tauri-apps/plugin-updater";
import { saveWindowState } from "@tauri-apps/plugin-window-state";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { tabForAltDigit, visibleTabs } from "@/config/settings/tabs.config";
import { usePolling } from "@/hooks/polling.hook";
import { pollAniListReleases } from "@/lib/anilist/notifications.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { readAppCache, writeAppCache } from "@/lib/store/cache.utils";
import { reportBackgroundError } from "@/lib/utils/attempt.utils";
import {
  DEEP_LINK_EVENT,
  allowsPastedLink,
  ingestDeepLinks,
  isEditablePasteTarget,
  parsePastedLink,
} from "@/lib/utils/deeplink.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { resolveNotificationText, showError } from "@/lib/utils/notification.utils";
import { checkForUpdates } from "@/lib/utils/update.utils";
import { useCacheStore } from "@/store/cache.store";
import { useCollectionStore } from "@/store/collection.store";
import { useDeepLinkStore } from "@/store/deeplink.store";
import { useNotificationStore } from "@/store/notification.store";
import { useSearchStore } from "@/store/search.store";
import { useSettingsStore } from "@/store/settings.store";
import { applyTheme, useThemeStore } from "@/store/theme.store";
import type { NotificationType, ShowNotificationPayload } from "@/types/notification";
import type { SearchLearningSnapshot } from "@/types/search";
import type { TabId } from "@/types/settings";
import type { FolderNode } from "@/types/torrent";

export function useApp(activeTab: TabId, setActiveTab: (t: TabId) => void) {
  const { t } = useI18n();

  const collectionTabEnabled = useSettingsStore((s) => s.collectionTabEnabled);
  const anilistTabEnabled = useSettingsStore((s) => s.anilistTabEnabled);
  const searchTabEnabled = useSettingsStore((s) => s.searchTabEnabled);
  const torrentTabEnabled = useSettingsStore((s) => s.torrentTabEnabled);
  const playerTabEnabled = useSettingsStore((s) => s.playerTabEnabled);
  const enableAnimations = useSettingsStore((s) => s.enableAnimations);
  const retroStyle = useSettingsStore((s) => s.retroStyle);
  const uiDensity = useSettingsStore((s) => s.uiDensity);
  const customScrollbar = useSettingsStore((s) => s.customScrollbar);
  const anilistReleaseNotifications = useSettingsStore((s) => s.anilistReleaseNotifications);
  const anilistPollIntervalMin = useSettingsStore((s) => s.anilistPollIntervalMin);

  const tabs = visibleTabs({
    collectionTabEnabled,
    anilistTabEnabled,
    searchTabEnabled,
    torrentTabEnabled,
    playerTabEnabled,
  }).map((tab) => ({
    ...tab,
    label: t(tab.key),
  }));
  const [isPending, startTransition] = useTransition();
  const setActiveTabTransition = useCallback(
    (tab: TabId) => startTransition(() => setActiveTab(tab)),
    [setActiveTab]
  );

  const [updateAvailable, setUpdateAvailable] = useState(false);
  const { data } = useQuery({
    queryFn: async (): Promise<Update | null> => checkForUpdates(),
    queryKey: ["connection"],
  });

  const initTabsRef = useRef(false);

  useEffect(() => {
    if (data) setUpdateAvailable(true);
  }, [data]);

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
      const state = useThemeStore.getState();
      applyTheme(state.currentTheme, state.customThemes);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (activeTab === ("preview" as TabId)) return;
    if (!initTabsRef.current && tabs.length > 0) {
      initTabsRef.current = true;
      const target = tabs[0].id;
      if (target !== activeTab) startTransition(() => setActiveTab(target as TabId));
    }
  }, [activeTab, tabs, setActiveTab]);

  useEffect(() => {
    if (activeTab === ("preview" as TabId)) return;
    const isActiveVisible = tabs.some((x) => x.id === activeTab);
    if (!isActiveVisible && tabs.length > 0)
      startTransition(() => setActiveTab(tabs[0].id as TabId));
  }, [activeTab, tabs, setActiveTab]);

  useEffect(() => {
    if (activeTab === ("preview" as TabId)) return;
    if (!collectionTabEnabled && activeTab === "collection")
      startTransition(() => setActiveTab("search"));
    if (!anilistTabEnabled && activeTab === "anilist")
      startTransition(() => setActiveTab("search"));
  }, [activeTab, collectionTabEnabled, anilistTabEnabled, setActiveTab]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "AltLeft" || e.code === "AltRight") return;
      if (!e.altKey || e.ctrlKey || e.shiftKey) return;
      if (!e.code.startsWith("Digit")) return;
      const digit = Number(e.code.slice("Digit".length));
      const tab = tabForAltDigit(useSettingsStore.getState(), digit);
      if (!tab) return;
      startTransition(() => setActiveTab(tab));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setActiveTab]);

  useEffect(() => {
    const current = useSearchStore.getState().crossSearchQuery;
    if (current) startTransition(() => setActiveTab("search"));
    return useSearchStore.subscribe((state, prev) => {
      if (state.crossSearchQuery && state.crossSearchQuery !== prev.crossSearchQuery)
        startTransition(() => setActiveTab("search"));
    });
  }, [setActiveTab]);

  useEffect(() => {
    const current = useSearchStore.getState().anilistSearchQuery;
    if (current && useSettingsStore.getState().anilistTabEnabled)
      startTransition(() => setActiveTab("anilist"));
    return useSearchStore.subscribe((state, prev) => {
      if (state.anilistSearchQuery && state.anilistSearchQuery !== prev.anilistSearchQuery) {
        if (!useSettingsStore.getState().anilistTabEnabled) return;
        startTransition(() => setActiveTab("anilist"));
      }
    });
  }, [setActiveTab]);
  useEffect(() => {
    const switchToCollection = () => {
      if (!useSettingsStore.getState().collectionTabEnabled) return;
      startTransition(() => setActiveTab("collection"));
    };
    if (useCollectionStore.getState().wizardPrefill) switchToCollection();
    return useCollectionStore.subscribe((state, prev) => {
      if (state.wizardPrefill && state.wizardPrefill !== prev.wizardPrefill) switchToCollection();
    });
  }, [setActiveTab]);

  useEffect(() => {
    const notificationTypes = new Set<NotificationType>(["info", "success", "warning", "error"]);
    let disposed = false;
    let unlisten: (() => void) | undefined;
    listen<ShowNotificationPayload>("show-notification", (event) => {
      const type = notificationTypes.has(event.payload.type as NotificationType)
        ? (event.payload.type as NotificationType)
        : "info";
      const { title, body } = resolveNotificationText(
        event.payload,
        useSettingsStore.getState().language
      );
      useNotificationStore.getState().add(title, type, body, event.payload.eventKey);
    })
      .then((cleanup) => {
        if (disposed) cleanup();
        else unlisten = cleanup;
      })
      .catch((error) => reportBackgroundError("notifications.listen", error));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const ingest = (urls: unknown) => {
      ingestDeepLinks(
        urls,
        (link) => useDeepLinkStore.getState().openAnime(link),
        () => showError(t("common.error"), t("anilist.details.link.invalid")),
        (link) => {
          if (!useSettingsStore.getState().torrentTabEnabled) {
            showError(t("common.error"), t("anilist.details.link.invalid"));
            return;
          }
          useDeepLinkStore.getState().openTorrent(link);
          setActiveTabTransition("torrent");
        }
      );
    };
    invokeTyped<string[]>("take_pending_deep_links")
      .then((urls) => {
        if (!disposed) ingest(urls);
      })
      .catch((error) => reportBackgroundError("deeplink.take-pending", error));
    listen<string[]>(DEEP_LINK_EVENT, (event) => {
      if (!disposed) ingest(event.payload);
    })
      .then((cleanup) => {
        if (disposed) cleanup();
        else unlisten = cleanup;
      })
      .catch((error) => reportBackgroundError("deeplink.listen", error));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [t, setActiveTabTransition]);

  useEffect(() => {
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
      if (!allowsPastedLink(parsed.kind, activeTab)) return;
      event.preventDefault();
      if (parsed.kind === "anime") useDeepLinkStore.getState().openAnime(parsed.link);
      else useDeepLinkStore.getState().openTorrent(parsed.link);
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [t, activeTab]);

  useEffect(() => {
    const switchToAnilist = () => {
      if (!useSettingsStore.getState().anilistTabEnabled) return;
      startTransition(() => setActiveTab("anilist"));
    };
    if (useDeepLinkStore.getState().target) switchToAnilist();
    return useDeepLinkStore.subscribe((state, prev) => {
      if (state.target && state.target !== prev.target) switchToAnilist();
    });
  }, [setActiveTab]);

  const releaseSignature = `${anilistReleaseNotifications}:${anilistPollIntervalMin}`;
  const prevReleaseSignatureRef = useRef(releaseSignature);
  const firstReleasePollRef = useRef(true);
  const releaseCancelledRef = useRef(false);
  useEffect(
    () => () => {
      releaseCancelledRef.current = true;
    },
    []
  );
  usePolling({
    intervalMs: Math.max(1, anilistPollIntervalMin) * 60 * 1000,
    enabled: anilistReleaseNotifications,
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
      if (ok) firstReleasePollRef.current = false;
      return ok;
    },
  });

  useEffect(() => {
    const sync = () => {
      const s = useSettingsStore.getState();
      invokeTyped("set_notification_settings", {
        config: {
          enabled: s.notificationsEnabled,
          on_complete: s.notifyOnComplete,
          on_error: s.notifyOnError,
        },
      }).catch((error) => reportBackgroundError("notification-settings.sync", error));
    };
    sync();
    return useSettingsStore.subscribe((state, previous) => {
      if (
        state.notificationsEnabled !== previous.notificationsEnabled ||
        state.notifyOnComplete !== previous.notifyOnComplete ||
        state.notifyOnError !== previous.notifyOnError
      )
        sync();
    });
  }, []);

  useEffect(() => {
    let disposed = false;
    useSearchStore.getState().clearAnimeIndex();
    Promise.all([
      readAppCache<{ path: string; tree: FolderNode }[]>("player", "folderTrees"),
      readAppCache<string>("torrent", "lastSaveDir"),
      readAppCache<Record<number, boolean>>("torrent", "seedPreferences"),
      readAppCache<Record<number, number>>("player", "episodeTracker"),
      readAppCache<SearchLearningSnapshot>("search", "learning"),
    ]).then(([folderTrees, lastSaveDir, seedPreferences, episodeTracker, learning]) => {
      if (disposed) return;
      const cache = useCacheStore.getState();
      if (folderTrees?.payload) cache.setFolderTrees(folderTrees.payload);
      if (lastSaveDir?.payload) {
        cache.setLastSaveDir(lastSaveDir.payload);
      }
      if (seedPreferences?.payload)
        useCacheStore.setState({ seedPreferences: seedPreferences.payload });
      if (episodeTracker?.payload) cache.setEpisodeTracker(episodeTracker.payload);
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
        useSearchStore.setState({
          history: learning.payload.history ?? [],
          queryStats: filterStats(learning.payload.queryStats ?? {}),
          suggestionStats: filterStats(learning.payload.suggestionStats ?? {}),
        });
      }
    });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    let timer: number | undefined;
    const saveLearning = () => {
      const state = useSearchStore.getState();
      const snapshot: SearchLearningSnapshot = {
        version: 1,
        history: state.history,
        queryStats: state.queryStats,
        suggestionStats: state.suggestionStats,
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
    const unsubscribe = useSearchStore.subscribe((state, previous) => {
      if (
        state.history !== previous.history ||
        state.queryStats !== previous.queryStats ||
        state.suggestionStats !== previous.suggestionStats
      ) {
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
