import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Update } from "@tauri-apps/plugin-updater";
import { saveWindowState } from "@tauri-apps/plugin-window-state";
import type { ReactElement } from "react";
import { useState, useEffect, useRef, lazy, Suspense } from "react";

import type { KeybindAction } from "@/config/keybinds.config";
import { getAction } from "@/config/keybinds.config";
import { readAppCache, writeAppCache } from "@/lib/app.cache";
import { useI18n } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n";
import TorrentFilePicker from "@/routes/components/search/picker.search";
import { useAniListNotificationsStore } from "@/store/anilist.store";
import { useCacheStore } from "@/store/cache.store";
import { useTorrentStore } from "@/store/download.store";
import { useNotificationStore } from "@/store/notification.store";
import type { NotificationType } from "@/types/notification";
import { useSearchStore } from "@/store/search.store";
import { useSettingsStore } from "@/store/settings.store";
import { applyTheme, useThemeStore } from "@/store/theme.store";
import type { FolderNode } from "@/types";
import type { SearchLearningSnapshot } from "@/types/search";

import { WindowLoader } from "./components/shared/loader.component";
import NotificationTray from "./components/shared/notification.component";
import Tabs from "./components/shared/tabs.component";
import Updater from "./components/shared/updater.component";
import { checkForUpdates } from "./lib/index.utils";
import { resolveNotificationText } from "./lib/notification.utils";
import type { ShowNotificationPayload } from "./lib/notification.utils";

const SearchRoute = lazy(() => import("@/routes/search.route"));
const TorrentRoute = lazy(() => import("@/routes/torrent.route"));
const PlayerRoute = lazy(() => import("@/routes/player.route"));
const AniListRoute = lazy(() => import("@/routes/anilist.route"));
const SettingsRoute = lazy(() => import("@/routes/settings.route"));
const VaultRoute = lazy(() => import("@/routes/vault.route"));

type Tab =
  | "search"
  | "torrent"
  | "player"
  | "anilist"
  | "vault"
  | "settings";

const tabKeys: readonly { id: Tab; key: TranslationKey }[] = [
  { id: "search", key: "app.search" },
  { id: "torrent", key: "app.torrent" },
  { id: "player", key: "app.player" },
  { id: "anilist", key: "app.anilist" },
  { id: "vault", key: "app.vault" },
  { id: "settings", key: "app.settings" },
];

function App() {
  const { t } = useI18n();
  const vaultTabEnabled = useSettingsStore((s) => s.vaultTabEnabled);
  const tabs = tabKeys
    .filter((tab) => tab.id !== "vault" || vaultTabEnabled)
    .map((tab) => ({ ...tab, label: t(tab.key) }));
  const [activeTab, setActiveTab] = useState<Tab>("search");
  const initTabsRef = useRef(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const customScrollbar = useSettingsStore((s) => s.customScrollbar);
  const init = useTorrentStore((s) => s.init);
  const pendingTorrent = useTorrentStore((s) => s.pendingTorrent);
  const preparingTorrent = useTorrentStore((s) => s.preparingTorrent);
  const lastSaveDir = useTorrentStore((s) => s.lastSaveDir);
  const confirmDownload = useTorrentStore((s) => s.confirmDownload);
  const cancelDownload = useTorrentStore((s) => s.cancelDownload);

  const enableAnimations = useSettingsStore((s) => s.enableAnimations);
  const retroStyle = useSettingsStore((s) => s.retroStyle);
  const uiDensity = useSettingsStore((s) => s.uiDensity);
  const anilistReleaseNotifications = useSettingsStore(
    (s) => s.anilistReleaseNotifications
  );
  const { data } = useQuery({
    queryFn: async (): Promise<Update | null> => {
      return await checkForUpdates();
    },
    queryKey: ["connection"],
  });

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
    document.documentElement.classList.toggle(
      "native-scrollbar",
      !customScrollbar
    );
  }, [customScrollbar]);

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
  }, [init]);

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
    if (!initTabsRef.current && tabs.length > 0) {
      initTabsRef.current = true;
      if (!tabs.some((t) => t.id === activeTab)) {
        setActiveTab(tabs[0].id);
      }
    }
  }, [activeTab, tabs]);

  useEffect(() => {
    if (!vaultTabEnabled && activeTab === "vault") setActiveTab("search");
  }, [activeTab, vaultTabEnabled]);


  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "AltLeft" || e.code === "AltRight") return;
      if (!e.altKey) return;

      const action = getAction(e.code, e.ctrlKey, e.shiftKey, e.altKey);
      if (!action) return;

      const actionMap: Partial<Record<KeybindAction, Tab>> = {
        setAnilist: "anilist",
        setPlayer: "player",
        setSearch: "search",
        setTorrent: "torrent",
      };

      const tab = actionMap[action.action];
      if (tab) setActiveTab(tab);
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const current = useSearchStore.getState().crossSearchQuery;
    if (current) setActiveTab("search");
    return useSearchStore.subscribe((state, prev) => {
      if (
        state.crossSearchQuery &&
        state.crossSearchQuery !== prev.crossSearchQuery
      ) {
        setActiveTab("search");
      }
    });
  }, []);

  useEffect(() => {
    const current = useSearchStore.getState().anilistSearchQuery;
    if (current) setActiveTab("anilist");
    return useSearchStore.subscribe((state, prev) => {
      if (
        state.anilistSearchQuery &&
        state.anilistSearchQuery !== prev.anilistSearchQuery
      ) {
        setActiveTab("anilist");
      }
    });
  }, []);

  useEffect(() => {
    const notificationTypes = new Set<NotificationType>([
      "info",
      "success",
      "warning",
      "error",
    ]);
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
      useNotificationStore
        .getState()
        .add(title, type, body, event.payload.eventKey);
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
    const pollAniListReleases = async () => {
      try {
        const user = await invoke<{ id: number } | null>("check_anilist_auth");
        if (!user || disposed) return;
        const lists = await invoke<
          {
            name: string;
            entries: Array<{
              media: {
                id: number;
                title: string;
                next_episode: number | null;
                next_airing_at: number | null;
                status: string;
              };
              list_status: string;
            }>;
          }[]
        >("get_anilist_lists", { userId: user.id });
        if (disposed) return;
        const observationStore = useAniListNotificationsStore.getState();
        const now = Math.floor(Date.now() / 1000);
        for (const list of lists)
          for (const entry of list.entries) {
            const { media } = entry;
            const key = String(media.id);
            const signature = `${media.status}|${media.next_episode ?? ""}|${media.next_airing_at ?? ""}|${entry.list_status}`;
            const previous = observationStore.observations[key];
            if (previous) {
              if (
                media.next_airing_at != null &&
                media.next_airing_at <= now &&
                previous.signature !== signature
              ) {
                useNotificationStore.getState().add(
                  t("notification.anilistNewEpisode"),
                  "info",
                  t("notification.anilistNewEpisodeBody", {
                    episode: media.next_episode ?? "?",
                    title: media.title,
                  })
                );
              } else if (
                entry.list_status === "COMPLETED" &&
                previous.status !== "COMPLETED"
              ) {
                useNotificationStore
                  .getState()
                  .add(
                    t("notification.anilistCompleted"),
                    "success",
                    media.title
                  );
              } else if (
                entry.list_status === "PLANNING" &&
                previous.status !== "PLANNING"
              ) {
                useNotificationStore
                  .getState()
                  .add(t("notification.anilistPlanned"), "info", media.title);
              }
            }
            observationStore.saveObservation(key, {
              signature,
              status: entry.list_status,
              title: media.title,
              updatedAt: Date.now(),
            });
          }
        if (!observationStore.initialized)
          observationStore.setInitialized(true);
      } catch {}
    };
    pollAniListReleases();
    const timer = window.setInterval(
      () => pollAniListReleases(),
      30 * 60 * 1000
    );
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [anilistReleaseNotifications, t]);

  useEffect(() => {
    let disposed = false;
    // Never expose a previous AniList user's title index before the current
    // account has been verified.
    useSearchStore.getState().clearAnimeIndex();
    Promise.all([
      readAppCache<{ path: string; tree: FolderNode }[]>(
        "player",
        "folderTrees"
      ),
      readAppCache<string>("torrent", "lastSaveDir"),
      readAppCache<Record<number, boolean>>("torrent", "seedPreferences"),
      readAppCache<Record<number, number>>("player", "episodeTracker"),
      readAppCache<SearchLearningSnapshot>("search", "learning"),
    ]).then(
      ([folderTrees, lastSaveDir, seedPreferences, episodeTracker, learning]) => {
        if (disposed) return;
        const cache = useCacheStore.getState();
        if (folderTrees?.payload) cache.setFolderTrees(folderTrees.payload);
        if (lastSaveDir?.payload) {
          cache.setLastSaveDir(lastSaveDir.payload);
          useTorrentStore.setState({ lastSaveDir: lastSaveDir.payload });
        }
        if (seedPreferences?.payload)
          useCacheStore.setState({ seedPreferences: seedPreferences.payload });
        if (episodeTracker?.payload)
          cache.setEpisodeTracker(episodeTracker.payload);
        if (learning?.payload) {
          useSearchStore.setState({
            history: learning.payload.history ?? [],
            queryStats: learning.payload.queryStats ?? {},
            suggestionStats: learning.payload.suggestionStats ?? {},
          });
          invoke<{ id: number } | null>("check_anilist_auth")
            .then((profile) => {
              if (
                !disposed &&
                profile?.id === learning.payload?.animeProfileId
              ) {
                useSearchStore.setState({
                  animeIndex: learning.payload.animeIndex ?? [],
                  animeProfileId: profile.id,
                });
              }
            })
            .catch(() => {});
        }
      }
    );
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
      writeAppCache("search", "learning", snapshot);
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
        timer = window.setTimeout(saveLearning, 500);
      }
    });
    return () => {
      unsubscribe();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const sync = () => {
      const s = useSettingsStore.getState();
      invoke("set_notification_settings", {
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
      ) {
        sync();
      }
    });
  }, []);

  const getComponent = () => {
    const tabMap = {
      anilist: <AniListRoute />,
      search: <SearchRoute />,
      settings: <SettingsRoute />,
      torrent: <TorrentRoute />,
      vault: <VaultRoute />,      } as Record<Exclude<Tab, "player">, ReactElement>;

    return tabMap[activeTab as Exclude<Tab, "player">];
  };

  return (
    <main
      className="relative h-screen w-screen overflow-hidden"
      onContextMenu={(e) => e.preventDefault()}
    >
      {data && updateAvailable && (
        <Updater update={data} onClose={() => setUpdateAvailable(false)} />
      )}

      {(preparingTorrent || pendingTorrent) && (
        <TorrentFilePicker
          torrent={pendingTorrent}
          loading={!!preparingTorrent && !pendingTorrent}
          defaultSaveDir={lastSaveDir}
          onConfirm={(selectedIndices, saveDir, subFolder, sequential) =>
            confirmDownload(selectedIndices, saveDir, subFolder, sequential)
          }
          onCancel={cancelDownload}
        />
      )}

      {/* WINDOW FRAME */}
      <section className="relative z-10 flex h-full flex-col">
        <div className="ui-panel flex h-full flex-col">
          {/* TITLE BAR + TAB BAR */}
          <div className="ui-titlebar justify-between select-none">
            <span className="windows95-text font-bold text-white">
              iluhaAnime
            </span>
            <NotificationTray />
          </div>
          <div className="shrink-0">
            <Tabs
              ariaLabel={t("common.sections")}
              tabs={tabs}
              activeTab={activeTab}
              onChange={(id) => setActiveTab(id as Tab)}
            />
          </div>

          {/* CONTENT PANEL */}
          <div className="windows95-border bg-surface relative mx-1 mb-1 min-h-0 flex-1 overflow-hidden p-1">
            <div className={activeTab === "player" ? "h-full" : "hidden"}>
              <Suspense fallback={<WindowLoader />}>
                <PlayerRoute />
              </Suspense>
            </div>
            {activeTab !== "player" && (
              <Suspense fallback={<WindowLoader />}>
                {getComponent()}
              </Suspense>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;
