import { usePlaylistStore, type PlaylistEntry } from "@/store/playlist.store";
import { useTorrentStore } from "@/store/download.store";
import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { ChevronDown, ChevronRight, FolderOpen, Plus } from "lucide-react";
import TorrentFilesSection from "@/routes/components/file.torrent";
import Modal from "@/components/shared/modal.component";
import PlaylistComponent from "../playlist.component";

function PlaylistLobby({ activePath, onPlay }: { activePath?: string; onPlay?: (entry: PlaylistEntry) => void }) {
  const { torrents, torrentFilesMap, loadTorrentFiles } = useTorrentStore(
    (state) => state,
  );
  const { entries, addEntry, removeEntry } = usePlaylistStore();

  const [showModal, setShowModal] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    torrents.forEach((t) => {
      if (!torrentFilesMap[t.id]) {
        loadTorrentFiles(t.id);
      }
    });
  }, [torrents, torrentFilesMap, loadTorrentFiles]);

  const handleAddEntry = (entry: PlaylistEntry) => {
    addEntry(entry);
    setShowModal(false);
  };

  const handleOpenFile = async () => {
    try {
      const file = await open({
        multiple: false,
        filters: [
          {
            name: "Video",
            extensions: [
              "mp4",
              "mkv",
              "avi",
              "mov",
              "webm",
              "flv",
              "wmv",
              "m4v",
              "mpg",
              "mpeg",
              "ts",
              "m2ts",
              "ogv",
              "3gp",
            ],
          },
          {
            name: "All Files",
            extensions: ["*"],
          },
        ],
      });
      if (file) {
        handleAddEntry({
          path: file,
          name: file.split(/[/\\]/).pop() ?? "Video",
        });
      }
    } catch {
      /* dialog cancelled */
    }
  };

  const toggleExpanded = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <main className="flex flex-col gap-1 p-1 h-full overflow-y-auto">
      <button
        className="flex items-center gap-1 text-[11px] windows95-font cursor-pointer hover:bg-surface px-1 py-0.5 w-full text-left windows95-active-border bg-primary"
        onClick={() => setShowModal(true)}
      >
        <Plus className="size-4" />
        Добавить видео
      </button>

      <PlaylistComponent entries={entries} activePath={activePath} onPlay={(entry) => onPlay?.(entry)} onRemove={removeEntry} />

      {showModal && (
        <Modal header="Выбор видео" onClose={() => setShowModal(false)}>
          <section className="windows95-active-border bg-primary p-1">
            <button
              className="flex items-center gap-1 text-[11px] windows95-font cursor-pointer hover:bg-surface px-1 py-0.5 w-full text-left"
              onClick={handleOpenFile}
            >
              <FolderOpen className="size-4" />
              Открыть файл
            </button>
          </section>

          <span className="text-[10px] windows95-font text-muted px-0.5">
            Торренты
          </span>

          <div className="flex flex-col gap-1 overflow-y-auto flex-1">
            {torrents.map((item) => {
              const isExpanded = expanded.has(item.id);
              const files = torrentFilesMap[item.id];

              return (
                <div
                  key={item.id}
                  className="flex flex-col windows95-active-border bg-primary gap-1"
                >
                  <section className="bg-secondary pb-1 px-1 line-clamp-1">
                    <span className="text-white text-[11px] font-bold windows95-font">
                      {item.name}
                    </span>
                  </section>

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
                          onPlay={(filePath) =>
                            handleAddEntry({
                              path: filePath,
                              name: filePath.split(/[/\\]/).pop() ?? item.name,
                            })
                          }
                        />
                      )}
                    </section>
                  )}
                </div>
              );
            })}
          </div>
        </Modal>
      )}
    </main>
  );
}

export default PlaylistLobby;
