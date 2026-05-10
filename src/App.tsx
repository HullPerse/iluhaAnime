import { useState, useEffect } from "react";
import SearchContent from "@/routes/search.route";
import TorrentContent from "@/routes/torrent.route";
import backgroundImage from "@/assets/background.jpg";
import { cn } from "@/lib/utils";
import { useTorrentStore } from "@/store/download.store";
import TorrentFilePicker from "@/routes/components/picker.search";

type Tab = "search" | "torrent";

const tabs: { id: Tab; label: string }[] = [
  { id: "search", label: "Поиск" },
  { id: "torrent", label: "Торрент" },
];

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("search");
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
      <div
        className="absolute inset-0 z-0 bg-background bg-no-repeat blur-xs brightness-50"
        style={{
          backgroundImage: `url(${backgroundImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />

      {/* WIN95 WINDOW FRAME */}
      <div className="relative z-10 h-full flex flex-col p-1">
        <div className="flex flex-col h-full windows95-active-border bg-primary shadow-lg">
          {/* TITLE BAR */}
          <div className="flex items-center justify-between bg-secondary px-1 py-0.5 select-none">
            <span className="text-white text-[11px] font-bold windows95-font">
              iluhaAnime
            </span>
          </div>

          {/* TAB BAR */}
          <div className="flex bg-primary pl-2 pt-1 gap-1">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  className={cn(
                    "px-3 py-0.5 text-[11px] border-2 border-solid relative cursor-pointer",
                    "windows95-font",
                    "active:outline-dotted active:outline-1 active:outline-offset-[-3px] active:outline-text",
                    isActive
                      ? "border-t-white border-l-white border-r-muted font-bold z-10"
                      : "border-t-white border-l-white border-b-muted border-r-muted",
                  )}
                  style={{
                    borderBottomColor: isActive ? "#c0c0c0" : undefined,
                    marginBottom: isActive ? "-2px" : undefined,
                    top: isActive ? 0 : "2px",
                  }}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* CONTENT PANEL */}
          <div className="flex-1 border-2 border-solid border-t-muted border-l-muted border-b-white border-r-white bg-primary mx-1 mb-1 p-1 overflow-hidden">
            {activeTab === "search" ? <SearchContent /> : <TorrentContent />}
          </div>
        </div>
      </div>
    </main>
  );
}

export default App;
