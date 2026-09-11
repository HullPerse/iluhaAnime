import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";

import { useApp } from "@/hooks/app.hook";
import { TORRENTS_QUERY_KEY } from "@/hooks/torrent/queries.hook";
import { useI18n } from "@/lib/locale/i18n.utils";
import TorrentFilePicker from "@/routes/components/search/default/picker.search";
import { useCacheStore } from "@/store/cache.store";
import { useTorrentStore } from "@/store/download.store";
import type { TabId } from "@/types/settings";

import { SmallLoader, TabLoader } from "./components/shared/loader.component";
import NotificationTray from "./components/shared/notification/tray.notification";
import StatusBar from "./components/shared/status.component";
import Tabs from "./components/shared/tabs.component";
import Updater from "./components/shared/updater.component";

const SearchRoute = lazy(() => import("@/routes/search.route"));
const TorrentRoute = lazy(() => import("@/routes/torrent.route"));
const PlayerRoute = lazy(() => import("@/routes/player.route"));
const AniListRoute = lazy(() => import("@/routes/anilist.route"));
const SettingsRoute = lazy(() => import("@/routes/settings.route"));
const CollectionRoute = lazy(() => import("@/routes/collection.route"));

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
  const [activeTab, setActiveTab] = useState<TabId>("search");
  const { tabs, isPending, setActiveTabTransition, data, updateAvailable, setUpdateAvailable } =
    useApp(activeTab, (tab) => setActiveTab(tab));

  const queryClient = useQueryClient();
  const pendingTorrent = useTorrentStore((s) => s.pendingTorrent);
  const preparingTorrent = useTorrentStore((s) => s.preparingTorrent);
  const lastSaveDir = useCacheStore((s) => s.lastSaveDir);
  const confirmDownload = useTorrentStore((s) => s.confirmDownload);
  const cancelDownload = useTorrentStore((s) => s.cancelDownload);
  const prefetchedTabs = useRef<Set<TabId>>(new Set());
  const [showPending, setShowPending] = useState(false);

  useEffect(() => {
    if (!isPending) {
      setShowPending(false);
      return;
    }
    const timer = window.setTimeout(() => setShowPending(true), 150);
    return () => window.clearTimeout(timer);
  }, [isPending]);

  const prefetchTab = (id: TabId) => {
    if (prefetchedTabs.current.has(id)) return;
    prefetchedTabs.current.add(id);
    TAB_PREFETCH[id]().catch(() => {
      prefetchedTabs.current.delete(id);
    });
  };

  const visibleTabs = tabs;

  const getComponent = () => {
    const tabMap = {
      anilist: <AniListRoute />,
      player: <PlayerRoute />,
      search: <SearchRoute />,
      settings: <SettingsRoute />,
      torrent: <TorrentRoute />,
      collection: <CollectionRoute />,
    } as Record<TabId, ReactElement>;
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
            confirmDownload(selectedIndices, saveDir, subFolder, sequential).then(() => {
              queryClient.invalidateQueries({ queryKey: TORRENTS_QUERY_KEY });
            })
          }
          onCancel={cancelDownload}
        />
      )}
      <section className="relative z-10 flex h-full flex-col">
        <div className="ui-panel flex h-full flex-col">
          <div className="ui-titlebar justify-between select-none">
            <span className="windows95-text font-bold text-white">iluhaAnime</span>
            <NotificationTray />
          </div>
          <div className="shrink-0">
            {" "}
            <Tabs
              ariaLabel={t("common.sections")}
              tabs={visibleTabs}
              activeTab={activeTab}
              onChange={(id) => setActiveTabTransition(id as TabId)}
              onPrefetch={(id) => prefetchTab(id as TabId)}
            />
          </div>
          <div className="windows95-border bg-surface relative mx-1 mb-1 min-h-0 flex-1 overflow-hidden">
            <Suspense fallback={<TabLoader />}>{getComponent()}</Suspense>
            {showPending && (
              <div className="bg-surface/70 absolute inset-0 flex items-center justify-center">
                <SmallLoader size={6} />
              </div>
            )}
          </div>
          <div className="relative">
            <StatusBar tabLabel={visibleTabs.find((tab) => tab.id === activeTab)?.label ?? ""} />
          </div>
        </div>
      </section>
    </main>
  );
}
