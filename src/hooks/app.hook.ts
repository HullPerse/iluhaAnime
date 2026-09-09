import { useQuery } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import type { Update } from "@tauri-apps/plugin-updater";
import { saveWindowState } from "@tauri-apps/plugin-window-state";
import { useEffect, useRef, useState, useTransition } from "react";

import { tabForAltDigit, visibleTabs } from "@/config/settings/tabs.config";
import { pollAniListReleases } from "@/lib/anilist/notifications.utils";
import { anilistProxyArgs } from "@/lib/anilist/proxy.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { readAppCache, writeAppCache } from "@/lib/store/cache.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { resolveNotificationText } from "@/lib/utils/notification.utils";
import { checkForUpdates } from "@/lib/utils/update.utils";
import { useCacheStore } from "@/store/cache.store";
import { useCollectionStore } from "@/store/collection.store";
import { useTorrentStore } from "@/store/download.store";
import { useNotificationStore } from "@/store/notification.store";
import { useSearchStore } from "@/store/search.store";
import { useSettingsStore } from "@/store/settings.store";
import { applyTheme, useThemeStore } from "@/store/theme.store";
import type { FolderNode } from "@/types";
import type { NotificationType, ShowNotificationPayload } from "@/types/notification";
import type { SearchLearningSnapshot } from "@/types/search";
import type { TabId } from "@/types/settings";

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
  const init = useTorrentStore((s) => s.init);

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
  const setActiveTabTransition = (tab: TabId) => startTransition(() => setActiveTab(tab));

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
      saveWindowState().catch(() => {});
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
    let disposed = false;
    let cleanup: (() => void) | undefined;
    init()
      .then((unlisten) => {
        if (disposed) unlisten();
        else cleanup = unlisten;
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        useNotificationStore.getState().add(t("app.torrent"), "error", message);
      });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [init, t]);

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
      .catch(() => {});
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!anilistReleaseNotifications) return;
    let disposed = false;
    let firstPoll = true;
    const pollReleases = async () => {
      const ok = await pollAniListReleases(t, () => disposed, { system: !firstPoll });
      if (ok) firstPoll = false;
    };
    pollReleases();
    const timer = window.setInterval(
      () => pollReleases(),
      Math.max(1, anilistPollIntervalMin) * 60 * 1000
    );
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [anilistReleaseNotifications, anilistPollIntervalMin, t]);

  useEffect(() => {
    const sync = () => {
      const s = useSettingsStore.getState();
      invokeTyped("set_notification_settings", {
        config: {
          enabled: s.notificationsEnabled,
          on_complete: s.notifyOnComplete,
          on_error: s.notifyOnError,
        },
      }).catch(() => {});
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
        invokeTyped<{ id: number } | null>(
          "check_anilist_auth",
          anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl)
        )
          .then((profile) => {
            if (!disposed && profile && profile.id === learning.payload?.animeProfileId) {
              useSearchStore.setState({
                animeIndex: learning.payload.animeIndex ?? [],
                animeProfileId: profile.id,
              });
            }
          })
          .catch(() => {});
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
        animeIndex: state.animeIndex,
        animeProfileId: state.animeProfileId,
        history: state.history,
        queryStats: state.queryStats,
        suggestionStats: state.suggestionStats,
      };
      const run = () => {
        writeAppCache("search", "learning", snapshot).catch(() => {});
      };
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(run, { timeout: 2000 });
      } else {
        run();
      }
    };
    const unsubscribe = useSearchStore.subscribe((state, previous) => {
      if (
        state.animeIndex !== previous.animeIndex ||
        state.animeProfileId !== previous.animeProfileId ||
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
