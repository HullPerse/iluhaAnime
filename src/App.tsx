import { useState } from "react";
import SearchContent from "@/components/search.component";
import TorrentContent from "@/components/torrent.component";
import backgroundImage from "@/assets/background.jpg";
import { cn } from "@/lib/utils";

type Tab = "search" | "torrent";

const tabs: { id: Tab; label: string }[] = [
  { id: "search", label: "Поиск" },
  { id: "torrent", label: "Торрент" },
];

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("search");

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#018281]">
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
        <div className="flex flex-col h-full border-2 border-solid border-t-white border-l-white border-b-muted border-r-muted bg-primary shadow-lg">
          {/* TITLE BAR */}
          <div className="flex items-center justify-between bg-secondary px-1 py-0.5 select-none">
            <span className="text-white text-[11px] font-bold font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui]">
              iluhaAnime
            </span>
          </div>

          {/* TAB BAR */}
          <div className="flex bg-primary pl-2 pt-1">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  className={cn(
                    "px-3 py-0.5 text-[11px] border-2 border-solid relative cursor-pointer",
                    "font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui]",
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
