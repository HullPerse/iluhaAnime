import { useTorrentStore } from "@/store/download.store";
import ProgressBar from "@/components/shared/progress-bar.component";
import {
  Trash2,
  Pause,
  Play,
  AlertCircle,
  CheckCircle2,
  DownloadCloud,
  Users,
} from "lucide-react";

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtSpeed(bps: number): string {
  if (bps <= 0) return "";
  if (bps < 1024) return `${bps.toFixed(0)} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}

function fmtETA(secs: number | null): string {
  if (!secs || secs <= 0 || !isFinite(secs)) return "";
  if (secs < 60) return `${Math.round(secs)} сек`;
  if (secs < 3600)
    return `${Math.floor(secs / 60)} мин ${Math.round(secs % 60)} сек`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h} ч ${m} мин`;
}

function stateLabel(state: string): string {
  switch (state) {
    case "live":
      return "Загружается";
    case "paused":
      return "Пауза";
    case "initializing":
      return "Инициализация";
    case "error":
      return "Ошибка";
    default:
      return state;
  }
}

function TorrentRoute() {
  const torrents = useTorrentStore((s) => s.torrents);
  const pauseTorrent = useTorrentStore((s) => s.pauseTorrent);
  const resumeTorrent = useTorrentStore((s) => s.resumeTorrent);
  const removeTorrent = useTorrentStore((s) => s.removeTorrent);

  return (
    <div className="h-full flex flex-col w-full gap-1">
      <div className="flex items-center gap-1 border-b-2 border-b-muted pb-1 mb-0.5">
        <DownloadCloud className="size-3.5 text-secondary" />
        <span className="text-[11px] font-bold font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui]">
          Torrents
        </span>
        {torrents.length > 0 && (
          <span className="text-[10px] text-muted font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui] ml-auto">
            Активно: {torrents.length}
          </span>
        )}
      </div>

      {torrents.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center">
          <p className="text-[11px] text-muted font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui]">
            Нет активных торрентов
          </p>
          <p className="text-[10px] text-muted font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui] mt-1">
            Нажмите "Скачать" в поиске, чтобы начать
          </p>
        </div>
      )}

      {torrents.length > 0 && (
        <div className="flex flex-col w-full h-full overflow-y-scroll gap-0.5 pr-0.5">
          {torrents.map((t) => {
            const pct = t.progress * 100;
            const isLive = t.state === "live";
            const isPaused = t.state === "paused";

            return (
              <div
                key={t.id}
                className="border-2 border-solid border-t-white border-l-white border-b-muted border-r-muted bg-[#c0c0c0] px-2 py-1.5"
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[11px] font-bold leading-tight font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui]">
                      {t.name || t.info_hash.slice(0, 16) + "..."}
                    </h3>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[9px] text-muted font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui]">
                        {stateLabel(t.state)}
                      </span>
                      {t.peers_connected > 0 && (
                        <span className="flex items-center gap-0.5 text-[9px] text-muted font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui]">
                          <Users className="size-2.5" />
                          {t.peers_connected}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {isLive && (
                      <button
                        onClick={() => pauseTorrent(t.id)}
                        className="border-2 border-solid border-t-white border-l-white border-b-muted border-r-muted bg-primary px-1 py-0.5 active:border-t-muted active:border-l-muted active:border-b-white active:border-r-white cursor-pointer"
                        title="Пауза"
                      >
                        <Pause className="size-3" />
                      </button>
                    )}
                    {isPaused && (
                      <button
                        onClick={() => resumeTorrent(t.id)}
                        className="border-2 border-solid border-t-white border-l-white border-b-muted border-r-muted bg-primary px-1 py-0.5 active:border-t-muted active:border-l-muted active:border-b-white active:border-r-white cursor-pointer"
                        title="Возобновить"
                      >
                        <Play className="size-3" />
                      </button>
                    )}
                    <button
                      onClick={() => removeTorrent(t.id)}
                      className="border-2 border-solid border-t-white border-l-white border-b-muted border-r-muted bg-primary px-1 py-0.5 active:border-t-muted active:border-l-muted active:border-b-white active:border-r-white cursor-pointer"
                      title="Удалить"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </div>

                {isLive && (
                  <div className="mt-1.5">
                    <ProgressBar value={t.progress_bytes} max={t.total_bytes} />
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[10px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui]">
                        {t.total_bytes > 0
                          ? `${fmtBytes(t.progress_bytes)} / ${fmtBytes(t.total_bytes)} (${pct.toFixed(1)}%)`
                          : fmtBytes(t.progress_bytes)}
                      </span>
                      <span className="text-[10px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui] text-muted">
                        {fmtSpeed(t.download_speed)}
                        {fmtSpeed(t.download_speed) &&
                          fmtETA(t.eta_secs) &&
                          " · "}
                        {fmtETA(t.eta_secs)}
                      </span>
                    </div>
                  </div>
                )}

                {isPaused && (
                  <div className="mt-1.5">
                    <ProgressBar value={t.progress_bytes} max={t.total_bytes} />
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[10px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui]">
                        {t.total_bytes > 0
                          ? `${fmtBytes(t.progress_bytes)} / ${fmtBytes(t.total_bytes)} (${pct.toFixed(1)}%)`
                          : fmtBytes(t.progress_bytes)}
                      </span>
                      <span className="text-[10px] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui] text-muted">
                        Приостановлено
                      </span>
                    </div>
                  </div>
                )}

                {t.finished && (
                  <div className="mt-1 flex items-center gap-1">
                    <CheckCircle2 className="size-3 text-[#008000]" />
                    <span className="text-[10px] text-[#008000] font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui]">
                      Завершено
                    </span>
                    <span className="text-[10px] text-muted ml-auto font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui]">
                      {fmtBytes(t.total_bytes)}
                    </span>
                  </div>
                )}

                {t.error && (
                  <div className="mt-1 flex items-center gap-1">
                    <AlertCircle className="size-3 text-destructive" />
                    <span className="text-[10px] text-destructive font-['MS_Sans_Serif','Microsoft_Sans_Serif','Segoe_UI',system-ui]">
                      {t.error}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default TorrentRoute;
