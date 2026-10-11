import { useQueryClient } from "@tanstack/react-query";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { openPath } from "@tauri-apps/plugin-opener";
import { useRef } from "react";

import { DbScreen } from "@/components/shared/db/screen.db";
import { SplashScreen } from "@/components/shared/splash/screen.splash";
import { tabIdFromPath, tabPathFromId } from "@/config/tabs/paths.config";
import { useApp } from "@/hooks/app.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { useDayNightScheduler } from "@/hooks/schedule.hook";
import { useScreenshot } from "@/hooks/screenshot.hook";
import { useEnsureAnimeIndex, usePrewarmSpellIndex } from "@/hooks/search/animeIndex.hook";
import { useSplashStages } from "@/hooks/splash.hook";
import { TORRENTS_QUERY_KEY } from "@/hooks/torrent/queries.hook";
import { useTray } from "@/hooks/tray.hook";
import { isCurrentSessionSafe } from "@/lib/fatal/report.utils";
import { useCell } from "@/lib/state/signal.hook";
import { attempt, reportBackgroundError } from "@/lib/utils/attempt.utils";
import TorrentFilePicker from "@/routes/components/search/default/picker.search";
import { cacheAtoms } from "@/store/cache.store";
import {
  cancelTorrentDownload as cancelDownload,
  confirmTorrentDownload as confirmDownload,
  torrentAtoms,
} from "@/store/download.store";
import { patchSettings, settingsAtoms } from "@/store/settings.store";
import { themeAtoms } from "@/store/theme.store";
import type { TabId } from "@/types/settings";

import NotificationTray from "./components/shared/notification/tray.notification";
import ScreenshotModal from "./components/shared/screenshot/modal.screenshot";
import StatusBar from "./components/shared/status.component";
import Tabs from "./components/shared/tabs.component";
import TitleBar from "./components/shared/titlebar.component";
import Updater from "./components/shared/updater.component";

const TAB_PREFETCH: Record<TabId, () => Promise<unknown>> = {
  anilist: () => import("@/routes/anilist.route"),
  collection: () => import("@/routes/collection.route"),
  player: () => import("@/routes/player.route"),
  search: () => import("@/routes/search.route"),
  settings: () => import("@/routes/settings.route"),
  torrent: () => import("@/routes/torrent.route"),
};

export default function App() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { tabs, data, updateAvailable, setUpdateAvailable } = useApp();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const activeTab = tabIdFromPath(pathname) ?? "search";

  const queryClient = useQueryClient();
  const pendingTorrent = useCell(torrentAtoms.pendingTorrent);
  const preparingTorrent = useCell(torrentAtoms.preparingTorrent);
  const lastSaveDir = useCell(cacheAtoms.lastSaveDir);
  const customTitleBarEnabled = useCell(settingsAtoms.customTitleBarEnabled);
  const statusBarEnabled = useCell(settingsAtoms.statusBarEnabled);
  const fastLaunch = useCell(settingsAtoms.fastLaunch);
  const currentTheme = useCell(themeAtoms.currentTheme);
  const prefetchedTabs = useRef<Set<TabId>>(new Set());

  const goToTab = (id: TabId) => {
    navigate({ to: tabPathFromId(id) });
  };

  const prefetchTab = (id: TabId) => {
    if (isCurrentSessionSafe()) return;
    if (prefetchedTabs.current.has(id)) return;
    if (tabs.some((tab) => tab.id === id && tab.disabled)) return;
    prefetchedTabs.current.add(id);
    (async () => {
      const [, error] = await attempt(TAB_PREFETCH[id]());
      if (error) {
        prefetchedTabs.current.delete(id);
        reportBackgroundError("tab.prefetch", error);
      }
    })();
  };

  useTray(tabs, goToTab);
  useDayNightScheduler();
  useEnsureAnimeIndex();
  usePrewarmSpellIndex();
  const { capture: screenshot, close: closeScreenshot } = useScreenshot();

  const openDataFolder = (dir: string) => {
    if (!dir) return;
    (async () => {
      const [, error] = await attempt(openPath(dir));
      if (error) reportBackgroundError("database.open-folder", error);
    })();
  };

  const splash = useSplashStages(tabs.length > 0);
  if (!fastLaunch && !splash.done && !splash.dbFailed) {
    return (
      <SplashScreen
        stages={splash.stages}
        themeName={currentTheme}
        safe={isCurrentSessionSafe()}
        fastLaunch={false}
        onToggleFastLaunch={() => patchSettings({ fastLaunch: true })}
      />
    );
  }

  if (splash.dbFailed) {
    return (
      <DbScreen
        error={splash.dbError ?? ""}
        themeName={currentTheme}
        safe={isCurrentSessionSafe()}
        dataDir={splash.dbStatus?.dataDir ?? ""}
        onRetry={() => splash.retryDatabase()}
        onReload={() => window.location.reload()}
        onOpenFolder={() => openDataFolder(splash.dbStatus?.dataDir ?? "")}
      />
    );
  }

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
            confirmDownload(selectedIndices, saveDir, subFolder, sequential).then(() => {
              queryClient.invalidateQueries({ queryKey: TORRENTS_QUERY_KEY });
            })
          }
          onCancel={cancelDownload}
        />
      )}
      {screenshot && <ScreenshotModal capture={screenshot} onClose={closeScreenshot} />}
      <section className="relative z-10 flex h-full flex-col">
        <div className="ui-panel flex h-full flex-col">
          {customTitleBarEnabled && <TitleBar title="iluhaAnime" />}
          <div className="shrink-0">
            <div className="flex max-w-full shrink-0 items-center gap-1 pt-1 pr-2 pl-2">
              <Tabs
                ariaLabel={t("common.sections")}
                tabs={tabs}
                activeTab={activeTab}
                onChange={goToTab}
                onPrefetch={prefetchTab}
              />
              <NotificationTray />
            </div>
          </div>
          <div className="windows95-border bg-surface relative mx-1 mb-1 min-h-0 flex-1 overflow-hidden">
            <Outlet />
          </div>
          {statusBarEnabled && (
            <div className="relative">
              <StatusBar tabLabel={tabs.find((tab) => tab.id === activeTab)?.label ?? ""} />
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
