import { TorrentInfo, useTorrentStore } from "@/store/download.store";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import TorrentFilesSection from "./components/file.torrent";
import Player from "@/components/shared/player.component";

function PlayerRoute() {
  const { torrents, torrentFilesMap, loadTorrentFiles } = useTorrentStore(
    (state) => state,
  );

  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const [video, setVideo] = useState<TorrentInfo | null>(null);

  useEffect(() => {
    torrents.forEach((t) => {
      if (!torrentFilesMap[t.id]) {
        loadTorrentFiles(t.id);
      }
    });
  }, [torrents, torrentFilesMap, loadTorrentFiles]);

  const toggleExpanded = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <main className="flex flex-col gap-1 h-full w-full overflow-y-scroll">
      {video ? (
        <Player header={video.name} onClose={() => setVideo(null)} />
      ) : (
        torrents.map((item, index) => {
          const isExpanded = expanded.has(item.id);
          const files = torrentFilesMap[item.id];

          return (
            <div
              key={index}
              className="flex flex-col windows95-active-border bg-primary gap-2"
            >
              {/*title and buttons*/}
              <section className="bg-secondary pb-1 px-1 line-clamp-1">
                <span className="text-white text-[11px] font-bold windows95-font">
                  {item.name}
                </span>
              </section>

              {/*files toggle*/}
              {files && (
                <section className="p-1 gap-1 flex flex-col">
                  <button
                    className="flex items-center gap-1 text-[10px] windows95-font cursor-pointer hover:bg-surface px-0.5 py-0.5 w-full text-left"
                    onClick={() => toggleExpanded(item.id)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="size-3" />
                    ) : (
                      <ChevronRight className="size-3" />
                    )}
                    Файлы ({files.length})
                  </button>
                  {isExpanded && (
                    <TorrentFilesSection
                      id={item.id}
                      files={files}
                      type="player"
                      path={item.save_dir}
                      onPlay={() => setVideo(item)}
                    />
                  )}
                </section>
              )}
              {/*info*/}
              {item.error && (
                <div className="mt-1 flex items-center gap-1">
                  <span className="text-[10px] text-destructive windows95-font">
                    {item.error}
                  </span>
                </div>
              )}
            </div>
          );
        })
      )}
    </main>
  );
}

export default PlayerRoute;
