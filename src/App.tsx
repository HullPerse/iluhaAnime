import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { openPath } from "@tauri-apps/plugin-opener";
import { useRef } from "react";

import { DbScreen } from "@/components/shared/db/screen.db";
import { SplashScreen } from "@/components/shared/splash/screen.splash";
import { tabIdFromPath, tabPathFromId } from "@/config/tabs/paths.config";
import { useApp } from "@/hooks/app.hook";
import { useDiscordPresence } from "@/hooks/discordPresence.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { useDayNightScheduler } from "@/hooks/schedule.hook";
import { useScreenshot } from "@/hooks/screenshot.hook";
import { useEnsureAnimeIndex, usePrewarmSpellIndex } from "@/hooks/search/animeIndex.hook";
import { useSecretCode } from "@/hooks/secretCode.hook";
import { useSplashStages } from "@/hooks/splash.hook";
import { prefetchStreamConstants, usePrewarmStreamHistory } from "@/hooks/stream/catalog.hook";
import { TORRENTS_QUERY_KEY } from "@/hooks/torrent/queries.hook";
import { useTorrents } from "@/hooks/torrent/queries.hook";
import { useTray } from "@/hooks/tray.hook";
import { useVimMode } from "@/hooks/vimMode.hook";
import { isCurrentSessionSafe } from "@/lib/fatal/report.utils";
import { useCell } from "@/lib/state/signal.hook";
import { resolveSecretTabAction } from "@/lib/tabs.utils";
import { attempt, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { ignore } from "@/lib/utils/promise.utils";
import TorrentFilePicker from "@/routes/components/search/default/picker.search";
import { cacheAtoms } from "@/store/cache.store";
import {
  cancelTorrentDownload as cancelDownload,
  confirmTorrentDownload as confirmDownload,
  torrentAtoms,
} from "@/store/download.store";
import { overlayAtoms } from "@/store/overlay.store";
import { patchSettings, settingsAtoms } from "@/store/settings.store";
import { themeAtoms } from "@/store/theme.store";
import type { TabId } from "@/types/settings";

import PageFindBar from "./components/shared/keyboard/findBar.keyboard.component";
import KeyboardHintOverlay from "./components/shared/keyboard/overlay.keyboard.component";
import NotificationToasts from "./components/shared/notification/toasts.notification";
import NotificationTray from "./components/shared/notification/tray.notification";
import ScreenshotModal from "./components/shared/screenshot/modal.screenshot";
import StatusBar from "./components/shared/status.component";
import Tabs from "./components/shared/tabs.component";
import TitleBar from "./components/shared/titlebar.component";
import Updater from "./components/shared/updater.component";

const TAB_PREFETCH: Record<TabId, () => Promise<unknown>> = {
  anilist: () => import("@/routes/anilist.route"),
  collection: () => import("@/routes/collection.route"),
  game: () => import("@/routes/game.route"),
  player: () => import("@/routes/player.route"),
  search: () => import("@/routes/search.route"),
  settings: () => import("@/routes/settings.route"),
  stream: () => import("@/routes/stream.route"),
  torrent: () => import("@/routes/torrent.route"),
};

/**
 * Data a tab can warm once its chunk is prefetched. Only the streaming tab has
 * any: its filter lists come from one request the Rust client caches for
 * twenty minutes, so a hover hides the network from the first "Filters" click.
 * The app start stays out of this: the request happens only when someone shows
 * interest in the tab.
 */
const TAB_WARM: Partial<Record<TabId, (client: QueryClient) => Promise<unknown>>> = {
  stream: (client) => prefetchStreamConstants(client),
};

export default function App() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { tabs, update, updatePromptOpen, closeUpdatePrompt } = useApp();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const activeTab = tabIdFromPath(pathname) ?? "search";

  const queryClient = useQueryClient();
  const pendingTorrent = useCell(torrentAtoms.pendingTorrent);
  const preparingTorrent = useCell(torrentAtoms.preparingTorrent);
  const { data: existingTorrents } = useTorrents();
  const lastSaveDir = useCell(cacheAtoms.lastSaveDir);
  const customTitleBarEnabled = useCell(settingsAtoms.customTitleBarEnabled);
  const statusBarEnabled = useCell(settingsAtoms.statusBarEnabled);
  const fastLaunch = useCell(settingsAtoms.fastLaunch);
  const currentTheme = useCell(themeAtoms.currentTheme);
  const overlays = useCell(overlayAtoms.entries);
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
        return;
      }
      // A failed data warm is not a failed chunk prefetch: the tab still opens
      // and its own query retries, so the warm reports nothing and stays
      // best-effort.
      const warm = TAB_WARM[id];
      if (warm) ignore(attempt(warm(queryClient)).then(() => undefined));
    })();
  };

  useTray(tabs, goToTab);
  useVimMode();
  useSecretCode(() => {
    const action = resolveSecretTabAction(
      settingsAtoms.gameTabUnlocked.get(),
      activeTab === "game"
    );
    if (action === "reveal") {
      patchSettings({ gameTabUnlocked: true });
      goToTab("game");
      return;
    }
    if (action === "hide") {
      patchSettings({ gameTabUnlocked: false });
    }
  });
  useDayNightScheduler();
  useEnsureAnimeIndex();
  useDiscordPresence(activeTab);
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
  // The history strip is read after the splash, not during it: the rows are
  // local and cheap, and warming them here keeps the first "History" click
  // from paying for the database read.
  usePrewarmStreamHistory(splash.done);
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
      {update && updatePromptOpen && overlays.length === 0 && (
        <Updater update={update} onClose={closeUpdatePrompt} />
      )}
      {(preparingTorrent || pendingTorrent) && (
        <TorrentFilePicker
          torrent={pendingTorrent}
          loading={!!preparingTorrent && !pendingTorrent}
          defaultSaveDir={lastSaveDir}
          existingTorrents={existingTorrents}
          onConfirm={async (selectedIndices, saveDir, subFolder, sequential) => {
            await confirmDownload(selectedIndices, saveDir, subFolder, sequential);
            queryClient.invalidateQueries({ queryKey: TORRENTS_QUERY_KEY });
          }}
          onCancel={cancelDownload}
        />
      )}
      {screenshot && <ScreenshotModal capture={screenshot} onClose={closeScreenshot} />}
      <KeyboardHintOverlay />
      <PageFindBar />
      <NotificationToasts />
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
