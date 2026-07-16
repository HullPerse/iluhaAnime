import { useState, useEffect, ReactElement, lazy, Suspense } from "react";
import { useTorrentStore } from "@/store/download.store";
import { useSearchStore } from "@/store/search.store";
import TorrentFilePicker from "@/routes/components/search/picker.search";
import { WindowLoader } from "./components/shared/loader.component";
import { checkForUpdates } from "./lib/index.utils";
import { getAction, KeybindAction } from "@/config/keybinds.config";
import { useSettingsStore } from "@/store/settings.store";
import { useNotificationStore } from "@/store/notification.store";
import { applyTheme, useThemeStore } from "@/store/theme.store";
import { checkNewEpisodes } from "@/lib/notifications.utils";
import type { AnimeNotifyMode } from "@/lib/notifications.utils";
import Updater from "./components/shared/updater.component";
import { Update } from "@tauri-apps/plugin-updater";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import Tabs from "./components/shared/tabs.component";
import NotificationTray from "./components/shared/notification.component";

const SearchRoute = lazy(() => import("@/routes/search.route"));
const TorrentRoute = lazy(() => import("@/routes/torrent.route"));
const PlayerRoute = lazy(() => import("@/routes/player.route"));
const AniListRoute = lazy(() => import("@/routes/anilist.route"));
const SettingsRoute = lazy(() => import("@/routes/settings.route"));

type Tab = "search" | "torrent" | "player" | "anilist" | "settings";

const tabs: { id: Tab; label: string }[] = [
  { id: "search", label: "Поиск" },
  { id: "torrent", label: "Торрент" },
  { id: "player", label: "Плеер" },
  { id: "anilist", label: "AniList" },
  { id: "settings", label: "Параметры" },
];

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("search");
  const [initTabs, setInitTabs] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
  const wallpaperBlur = useSettingsStore((s) => s.wallpaperBlur);
  const showWallpaper = useSettingsStore((s) => s.showWallpaper);
  const customScrollbar = useSettingsStore((s) => s.customScrollbar);
  const init = useTorrentStore((s) => s.init);
  const pendingTorrent = useTorrentStore((s) => s.pendingTorrent);
  const preparingTorrent = useTorrentStore((s) => s.preparingTorrent);
  const lastSaveDir = useTorrentStore((s) => s.lastSaveDir);
  const confirmDownload = useTorrentStore((s) => s.confirmDownload);
  const cancelDownload = useTorrentStore((s) => s.cancelDownload);

  const enableAnimations = useSettingsStore((s) => s.enableAnimations);
  //checking for connection
  const { data } = useQuery({
    queryKey: ["connection"],
    queryFn: async (): Promise<Update | null> => {
      const update = await checkForUpdates();

      if (update) setUpdateAvailable(true);
      return update;
    },
  });

  useEffect(() => {
    document.documentElement.classList.toggle(
      "no-animations",
      !enableAnimations,
    );
  }, [enableAnimations]);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "native-scrollbar",
      !customScrollbar,
    );
  }, [customScrollbar]);

  useEffect(() => {
    const cleanup = init();
    return () => {
      cleanup.then((fn) => fn());
    };
  }, [init]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const state = useThemeStore.getState();
      applyTheme(state.currentTheme, state.customThemes);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const visibleTabs = tabs;

  useEffect(() => {
    if (!initTabs && visibleTabs.length > 0) {
      setInitTabs(true);
      if (!visibleTabs.find((t) => t.id === activeTab)) {
        setActiveTab(visibleTabs[0].id as Tab);
      }
    }
  }, [visibleTabs, activeTab, initTabs]);

  //tab keybinds
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "AltLeft" || e.code === "AltRight") return;
      if (!e.altKey) return;

      const action = getAction(e.code, e.ctrlKey, e.shiftKey, e.altKey);
      if (!action) return;

      const actionMap: Partial<Record<KeybindAction, Tab>> = {
        setSearch: "search",
        setTorrent: "torrent",
        setPlayer: "player",
        setAnilist: "anilist",
      };

      const tab = actionMap[action.action];
      if (tab) setActiveTab(tab);
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    return useSearchStore.subscribe((state, prev) => {
      if (
        state.crossSearchQuery &&
        state.crossSearchQuery !== prev.crossSearchQuery
      ) {
        setActiveTab("search");
      }
    });
  }, []);

  // Listen for backend show-notification events (torrent complete/error)
  useEffect(() => {
    const unlisten = listen<{ title: string; body: string; type: string }>(
      "show-notification",
      (event) => {
        useNotificationStore
          .getState()
          .add(
            event.payload.title,
            event.payload.type as any,
            event.payload.body,
          );
      },
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Sync notification settings to backend
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
    return useSettingsStore.subscribe(sync);
  }, []);

  const APP_SESSION_START = Date.now();

  // Check for new anime episodes
  const animeNotifyMode = useSettingsStore((s) => s.animeNotifyMode);
  useEffect(() => {
    if (animeNotifyMode === "none") return;

    checkNewEpisodes(APP_SESSION_START, animeNotifyMode as AnimeNotifyMode);

    const interval = setInterval(
      () =>
        checkNewEpisodes(APP_SESSION_START, animeNotifyMode as AnimeNotifyMode),
      30 * 60 * 1000,
    );
    return () => clearInterval(interval);
  }, [animeNotifyMode]);

  const getComponent = () => {
    const tabMap = {
      search: <SearchRoute />,
      torrent: <TorrentRoute />,
      player: <PlayerRoute />,
      anilist: <AniListRoute />,
      settings: <SettingsRoute />,
    } as Record<Tab, ReactElement>;

    return tabMap[activeTab];
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-desktop">
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
      {/* WALLPAPER */}
      {showWallpaper && (
        <div
          className={`absolute inset-0 z-0 bg-background bg-no-repeat ${wallpaperBlur ? "blur-xs brightness-50" : ""}`}
          style={{
            backgroundImage: `url(/background.jpg)`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      )}

      {/* WINDOW FRAME */}
      <div className="relative z-10 h-full flex flex-col">
        <div className="flex flex-col h-full windows95-active-border bg-primary">
          {/* TITLE BAR + TAB BAR */}
          <div className="flex items-center justify-between bg-secondary px-1 py-0.5 select-none">
            <span className="text-white font-bold windows95-text">
              iluhaAnime
            </span>
            <NotificationTray />
          </div>
          <div className="flex bg-primary pl-2 pt-1 gap-1">
            <Tabs
              tabs={visibleTabs}
              activeTab={activeTab}
              onChange={(id) => setActiveTab(id as Tab)}
            />
          </div>

          {/* CONTENT PANEL */}
          <div className="flex-1 overflow-hidden mx-1 mb-1 p-1 windows95-border">
            <Suspense fallback={<WindowLoader />}>{getComponent()}</Suspense>
          </div>
        </div>
      </div>
    </main>
  );
}

export default App;
