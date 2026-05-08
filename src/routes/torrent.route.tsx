import ProgressBar from "@/components/shared/progress.component";
import { Button } from "@/components/ui/button.component";
import { fmtBytes, fmtETA, fmtSpeed, stateLabel } from "@/lib/torrent.utils";
import { useTorrentStore } from "@/store/download.store";
import { Pause, Play, Trash } from "lucide-react";

function TorrentRoute() {
  const { torrents, pauseTorrent, resumeTorrent, removeTorrent } =
    useTorrentStore((state) => state);

  return (
    <main className="flex flex-col gap-1 h-full w-full overflow-y-scroll">
      {torrents.map((item, index) => {
        const progress = item.progress * 100;
        const isPaused = item.state === "paused";
        const isLive = item.state === "live";

        return (
          <div
            key={index}
            className="flex flex-col p-2 border-2 border-solid border-t-white border-l-white border-b-muted border-r-muted bg-[#c0c0c0] gap-2"
          >
            {/*title and buttons*/}
            <section className="flex flex-row items-center justify-between">
              <h3 className="line-clamp-1 text-xs font-bold leading-tight font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui]">
                {item.name}
              </h3>
              <div className="flex flex-row items-center gap-1">
                <Button
                  title="Поставить на паузу"
                  rendered={isLive}
                  size="icon"
                  className="size-6"
                  onClick={() => pauseTorrent(item.id)}
                  disabled={!isLive}
                >
                  <Pause />
                </Button>
                <Button
                  title="Продолжить скачивание"
                  rendered={isPaused}
                  size="icon"
                  className="size-6"
                  onClick={() => resumeTorrent(item.id)}
                  disabled={!isLive}
                >
                  <Play />
                </Button>
                <Button
                  variant="error"
                  title="Удалить торрент"
                  size="icon"
                  className="size-6"
                  onClick={() => removeTorrent(item.id)}
                  disabled={!item}
                >
                  <Trash />
                </Button>
              </div>
            </section>
            {/*progress bar and status inside progress bar*/}
            <section className="flex flex-row items-start justify-between gap-1 w-full">
              <div className="flex w-full flex-col">
                <ProgressBar
                  value={item.progress_bytes}
                  max={item.total_bytes}
                />
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-muted font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui]">
                    {!item.finished ? stateLabel(item.state) : "Завершено"}
                  </span>
                  <span className="text-[10px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui]">
                    {item.total_bytes > 0
                      ? `${fmtBytes(item.progress_bytes)} / ${fmtBytes(item.total_bytes)} (${progress.toFixed(1)}%)`
                      : fmtBytes(item.progress_bytes)}
                  </span>
                  <span className="text-[10px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui] text-muted">
                    {fmtSpeed(item.download_speed)}
                    {fmtSpeed(item.download_speed) &&
                      fmtETA(item.eta_secs) &&
                      " · "}
                    {fmtETA(item.eta_secs)}
                  </span>
                </div>
              </div>
            </section>
            {/* info */}
            {item.error && (
              <div className="mt-1 flex items-center gap-1">
                <span className="text-[10px] text-destructive font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui]">
                  {item.error}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </main>
  );
}

export default TorrentRoute;
