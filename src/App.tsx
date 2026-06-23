import { useState, useEffect, ReactElement, lazy, Suspense, useCallback } from "react";
import backgroundImage from "@/assets/background.jpg";
import { useTorrentStore } from "@/store/download.store";
import TorrentFilePicker from "@/routes/components/picker.search";
import { WindowLoader } from "./components/shared/loader.component";
import { Button } from "./components/ui/button.component";
import { cn } from "./lib/utils";

const SearchRoute = lazy(() => import("@/routes/search.route"));
const TorrentRoute = lazy(() => import("@/routes/torrent.route"));
const PlayerRoute = lazy(() => import("@/routes/player.route"));

type Tab = "search" | "torrent" | "player";

const tabs: { id: Tab; label: string }[] = [
  { id: "search", label: "Поиск" },
  { id: "torrent", label: "Торрент" },
  { id: "player", label: "Плеер" },
];

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("search");
  const [cinemaMode, setCinemaMode] = useState(false);
  const [autoHideUi, setAutoHideUi] = useState(false);

  const toggleCinemaMode = useCallback(() => setCinemaMode((p) => !p), []);
  const toggleAutoHide = useCallback(() => setAutoHideUi((p) => !p), []);
  const init = useTorrentStore((s) => s.init);
  const pendingTorrent = useTorrentStore((s) => s.pendingTorrent);
  const preparingTorrent = useTorrentStore((s) => s.preparingTorrent);
  const lastSaveDir = useTorrentStore((s) => s.lastSaveDir);
  const confirmDownload = useTorrentStore((s) => s.confirmDownload);
  const cancelDownload = useTorrentStore((s) => s.cancelDownload);

  useEffect(() => {
    const cleanup = init();
    return () => {
      cleanup.then((fn) => fn());
    };
  }, [init]);

  // Escape exits cinema mode
  useEffect(() => {
    if (!cinemaMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        setCinemaMode(false);
        setAutoHideUi(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [cinemaMode]);

  const getComponent = () => {
    const tabMap = {
      search: <SearchRoute />,
      torrent: <TorrentRoute />,
      player: <PlayerRoute cinemaMode={cinemaMode} autoHideUi={autoHideUi} onToggleCinema={toggleCinemaMode} onToggleAutoHide={toggleAutoHide} />,
    } as Record<Tab, ReactElement>;

    return tabMap[activeTab];
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#018281]">
      {(preparingTorrent || pendingTorrent) && (
        <TorrentFilePicker
          torrent={pendingTorrent}
          loading={!!preparingTorrent && !pendingTorrent}
          defaultSaveDir={lastSaveDir}
          onConfirm={(selectedIndices, saveDir, subFolder) =>
            confirmDownload(selectedIndices, saveDir, subFolder)
          }
          onCancel={cancelDownload}
        />
      )}
      {/* WALLPAPER */}
      {!cinemaMode && (
        <div
          className="absolute inset-0 z-0 bg-background bg-no-repeat blur-xs brightness-50"
          style={{
            backgroundImage: `url(${backgroundImage})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      )}

      {/* WINDOW FRAME */}
      <div className={cn("relative z-10 h-full flex flex-col p-1", cinemaMode && "p-0")}>
        <div className={cn("flex flex-col h-full windows95-active-border bg-primary shadow-lg", cinemaMode && "border-0")}>
          {/* TITLE BAR + TAB BAR — hidden in cinema mode */}
          {!cinemaMode && (
            <>
              <div className="flex items-center justify-between bg-secondary px-1 py-0.5 select-none">
                <span className="text-white text-[11px] font-bold windows95-font">
                  iluhaAnime
                </span>
              </div>
              <div className="flex bg-primary pl-2 pt-1 gap-1">
                {tabs.map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <Button
                      key={tab.id}
                      className="px-3 py-0.5 text-[11px] border-2 border-solid relative cursor-pointer windows95-font active:outline-dotted active:outline-1 active:outline-offset-[-3px] active:outline-text"
                      style={{
                        borderBottomColor: isActive ? "#c0c0c0" : undefined,
                        marginBottom: isActive ? "-2px" : undefined,
                        top: isActive ? 0 : "2px",
                      }}
                      onClick={() => setActiveTab(tab.id)}
                      disabled={isActive}
                    >
                      {tab.label}
                    </Button>
                  );
                })}
              </div>
            </>
          )}

          {/* CONTENT PANEL */}
          <div className={cn("flex-1 overflow-hidden", cinemaMode ? "m-0 border-0" : "border-2 border-solid border-t-muted border-l-muted border-b-white border-r-white bg-primary mx-1 mb-1 p-1")}>
            <Suspense fallback={<WindowLoader />}>{getComponent()}</Suspense>
          </div>
        </div>
      </div>
    </main>
  );
}

export default App;
