import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Update } from "@tauri-apps/plugin-updater";
import { saveWindowState } from "@tauri-apps/plugin-window-state";
import type { ReactElement } from "react";
import {
  useState,
  useEffect,
  useRef,
  lazy,
  Suspense,
  useTransition,
} from "react";

import type { KeybindAction } from "@/config/keybinds.config";
import { getAction } from "@/config/keybinds.config";
import { readAppCache, writeAppCache } from "@/lib/app.cache";
import { useI18n } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n";
import TorrentFilePicker from "@/routes/components/search/picker.search";
import { useCacheStore } from "@/store/cache.store";
import { useTorrentStore } from "@/store/download.store";
import { useNotificationStore } from "@/store/notification.store";
import { useSearchStore } from "@/store/search.store";
import { useSettingsStore } from "@/store/settings.store";
import { applyTheme, useThemeStore } from "@/store/theme.store";
import type { FolderNode } from "@/types";
import type { NotificationType } from "@/types/notification";
import type { SearchLearningSnapshot } from "@/types/search";

import { SmallLoader, TabLoader } from "./components/shared/loader.component";
import NotificationTray from "./components/shared/notification.component";
import StatusBar from "./components/shared/status.component";
import Tabs from "./components/shared/tabs.component";
import Updater from "./components/shared/updater.component";
import { pollAniListReleases } from "./lib/anilist.notifications";
import { checkForUpdates } from "./lib/index.utils";
import { resolveNotificationText } from "./lib/notification.utils";
import type { ShowNotificationPayload } from "./lib/notification.utils";

const SearchRoute = lazy(() => import("@/routes/search.route"));
const TorrentRoute = lazy(() => import("@/routes/torrent.route"));
const PlayerRoute = lazy(() => import("@/routes/player.route"));
const AniListRoute = lazy(() => import("@/routes/anilist.route"));
const SettingsRoute = lazy(() => import("@/routes/settings.route"));
const VaultRoute = lazy(() => import("@/routes/vault.route"));
const CollectionRoute = lazy(() => import("@/routes/collection.route"));

type Tab =
  | "search"
  | "torrent"
  | "player"
  | "anilist"
  | "vault"
  | "collection"
  | "settings";

const tabKeys: readonly { id: Tab; key: TranslationKey }[] = [
  { id: "search", key: "app.search" },
  { id: "torrent", key: "app.torrent" },
  { id: "player", key: "app.player" },
  { id: "anilist", key: "app.anilist" },
  { id: "vault", key: "app.vault" },
  { id: "collection", key: "app.collection" },
  { id: "settings", key: "app.settings" },
];

function App() {
  const { t } = useI18n();
  const vaultTabEnabled = useSettingsStore((s) => s.vaultTabEnabled);
  const collectionTabEnabled = useSettingsStore((s) => s.collectionTabEnabled);
  const tabs = tabKeys
    .filter((tab) => tab.id !== "vault" || vaultTabEnabled)
    .filter((tab) => tab.id !== "collection" || collectionTabEnabled)
    .map((tab) => ({ ...tab, label: t(tab.key) }));

  const [activeTab, setActiveTab] = useState<Tab>("search");
  const [isPending, startTransition] = useTransition();
  const initTabsRef = useRef(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const customScrollbar = useSettingsStore((s) => s.customScrollbar);
  const init = useTorrentStore((s) => s.init);
  const pendingTorrent = useTorrentStore((s) => s.pendingTorrent);
  const preparingTorrent = useTorrentStore((s) => s.preparingTorrent);
  const lastSaveDir = useTorrentStore((s) => s.lastSaveDir);
  const confirmDownload = useTorrentStore((s) => s.confirmDownload);
  const cancelDownload = useTorrentStore((s) => s.cancelDownload);

  const setActiveTabTransition = (tab: Tab) => {
    startTransition(() => setActiveTab(tab));
  };

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
  }, [init, t]);

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
      if (!tabs.some((t) => t.id === activeTab))
        startTransition(() => setActiveTab(tabs[0].id));
    }
  }, [activeTab, tabs]);

  useEffect(() => {
    if (!vaultTabEnabled && activeTab === "vault")
      startTransition(() => setActiveTab("search"));
  }, [activeTab, vaultTabEnabled]);

  useEffect(() => {
    if (!collectionTabEnabled && activeTab === "collection")
      startTransition(() => setActiveTab("search"));
  }, [activeTab, collectionTabEnabled]);

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
      if (tab) startTransition(() => setActiveTab(tab));
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const current = useSearchStore.getState().crossSearchQuery;
    if (current) startTransition(() => setActiveTab("search"));
    return useSearchStore.subscribe((state, prev) => {
      if (
        state.crossSearchQuery &&
        state.crossSearchQuery !== prev.crossSearchQuery
      ) {
        startTransition(() => setActiveTab("search"));
      }
    });
  }, []);

  useEffect(() => {
    const current = useSearchStore.getState().anilistSearchQuery;
    if (current) startTransition(() => setActiveTab("anilist"));
    return useSearchStore.subscribe((state, prev) => {
      if (
        state.anilistSearchQuery &&
        state.anilistSearchQuery !== prev.anilistSearchQuery
      ) {
        startTransition(() => setActiveTab("anilist"));
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
    const pollReleases = async () => {
      await pollAniListReleases(t, () => disposed);
    };
    /*
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
        const missed: Array<{ title: string; episode: number }> = [];
        let airingCount = 0;
        let hasPrevious = 0;
        let notified = 0;
        for (const list of lists)
          for (const entry of list.entries) {
            const { media } = entry;
            const key = String(media.id);
            const signature = `${media.status}|${media.next_episode ?? ""}|${media.next_airing_at ?? ""}|${entry.list_status}`;
            const previous = observationStore.observations[key];
            if (media.next_airing_at != null) airingCount++;
            if (previous) {
              hasPrevious++;
              // Missed while app was closed: previous next airing was in the past and episode advanced.
              // Show ALL missed episodes from previous.nextEpisode up to (but not including) current next_episode.
              const prevAired = previous.nextAiringAt != null && previous.nextAiringAt <= now;
              const episodeAdvanced =
                previous.nextEpisode != null &&
                media.next_episode != null &&
                media.next_episode !== previous.nextEpisode;
              const prevStillCurrent =
                media.next_episode === previous.nextEpisode && media.next_airing_at === previous.nextAiringAt;
              if (prevAired && episodeAdvanced && !prevStillCurrent) {
                // previous.nextEpisode is the episode that aired while we were away.
                // If current next_episode > previous.nextEpisode + 1, multiple episodes aired.
                // current upcoming, not aired yet
                const start = previous.nextEpisode as number;
                const end = media.next_episode as number;
                for (let ep = start; ep < end; ep++) {
                  const dedupKey = `${key}:${ep}`;
                  const already = useNotificationStore
                    .getState()
                    .items.some((n) => n.eventKey === dedupKey);
                  if (already) continue;
                  missed.push({ title: media.title, episode: ep });
                  notified++;
                  useNotificationStore.getState().add(
                    t("notification.anilistNewEpisode"),
                    "info",
                    t("notification.anilistNewEpisodeBody", {
                      episode: String(ep),
                      title: media.title,
                    }),
                    dedupKey
                  );
                }
              }
              // Also handle case where current next episode is now airing (app was open)
              if (
                media.next_airing_at != null &&
                media.next_airing_at <= now &&
                previous.signature !== signature &&
                media.next_airing_at !== previous.nextAiringAt
              ) {
                const dedupKey = `${key}:${media.next_episode}`;
                const already = useNotificationStore
                  .getState()
                  .items.some((n) => n.eventKey === dedupKey);
                if (!already) {
                  notified++;
                  useNotificationStore.getState().add(
                    t("notification.anilistNewEpisode"),
                    "info",
                    t("notification.anilistNewEpisodeBody", {
                      episode: media.next_episode ?? "?",
                      title: media.title,
                    }),
                    dedupKey
                  );
                }
              }
              if (
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
              nextEpisode: media.next_episode,
              nextAiringAt: media.next_airing_at,
            });
          }
        }
      */
    pollReleases();
    const timer = window.setInterval(() => pollReleases(), 30 * 60 * 1000);
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
      ([
        folderTrees,
        lastSaveDir,
        seedPreferences,
        episodeTracker,
        learning,
      ]) => {
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
      player: <PlayerRoute />,
      search: <SearchRoute />,
      settings: <SettingsRoute />,
      torrent: <TorrentRoute />,
      vault: <VaultRoute />,
      collection: <CollectionRoute />,
    } as Record<Tab, ReactElement>;

    return tabMap[activeTab];
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
              onChange={(id) => setActiveTabTransition(id as Tab)}
            />
          </div>

          {/* CONTENT PANEL */}
          <div className="windows95-border bg-surface relative mx-1 mb-1 min-h-0 flex-1 overflow-hidden p-1">
            <Suspense fallback={<TabLoader />}>{getComponent()}</Suspense>
            {isPending && (
              <div className="bg-surface/70 absolute inset-0 flex items-center justify-center">
                <SmallLoader size={6} />
              </div>
            )}
          </div>

          {/* STATUS BAR */}
          <StatusBar
            tabLabel={tabs.find((tab) => tab.id === activeTab)?.label ?? ""}
          />
        </div>
      </section>
    </main>
  );
}

export default App;
