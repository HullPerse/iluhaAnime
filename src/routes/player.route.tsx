import { useTorrentStore } from "@/store/download.store";
import { ChevronDown, ChevronRight, FolderOpen } from "lucide-react";
import { useEffect, useState } from "react";
import TorrentFilesSection from "./components/file.torrent";
import Player from "@/components/shared/player.component";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { VideoStreamInfo } from "@/types";

function PlayerRoute() {
  const { torrents, torrentFilesMap, loadTorrentFiles } = useTorrentStore(
    (state) => state,
  );

  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const [video, setVideo] = useState<{
    path: string;
    file: string;
  } | null>(null);

  const [chapters, setChapters] = useState<
    { start_time: number; end_time: number; title: string }[]
  >([]);

  const [streams, setStreams] = useState<VideoStreamInfo[]>([]);

  useEffect(() => {
    if (!video) {
      setChapters([]);
      setStreams([]);
      return;
    }

    invoke<{ start_time: number; end_time: number; title: string }[]>(
      "get_video_chapters",
      { path: video.path },
    )
      .then((chs) => setChapters(chs))
      .catch(() => setChapters([]));

    Promise.all([
      invoke<VideoStreamInfo[]>("get_video_streams", { path: video.path }),
      invoke<VideoStreamInfo[]>("scan_external_tracks", { path: video.path }),
    ])
      .then(([embedded, external]) => setStreams([...embedded, ...external]))
      .catch(() => setStreams([]));
  }, [video]);

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
        setVideo({
          path: file,
          file: file.split(/[/\\]/).pop() ?? "Video",
        });
      }
    } catch {
      /* dialog cancelled */
    }
  };

  return (
    <main className="flex flex-col gap-1 h-full w-full overflow-y-scroll">
      {video ? (
        <Player
          header={video.file}
          src={convertFileSrc(video.path)}
          onClose={() => setVideo(null)}
          chapters={chapters}
          mediaPath={video.path}
          streams={streams}
        />
      ) : (
        <>
          <section className="windows95-active-border bg-primary p-1">
            <button
              className="flex items-center gap-1 text-[11px] windows95-font cursor-pointer hover:bg-surface px-1 py-0.5 w-full text-left"
              onClick={handleOpenFile}
            >
              <FolderOpen className="size-4" />
              Открыть файл
            </button>
          </section>

          {torrents.map((item, index) => {
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
                        onPlay={(filePath) =>
                          setVideo({
                            path: filePath,
                            file: filePath.split(/[/\\]/).pop() ?? item.name,
                          })
                        }
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
          })}
        </>
      )}
    </main>
  );
}

export default PlayerRoute;
