import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import Modal from "@/components/shared/modal.component";
import ProgressBar from "@/components/shared/progress.component";
import { Button } from "@/components/ui/button.component";

interface PrefetchItem {
  id: number;
  title: string;
  relations: string[];
}

interface PrefetchProgressPayload {
  done: number;
  total: number;
  remaining: number;
  fetched: number;
  skipped: number;
  current: string | null;
  items: PrefetchItem[];
  elapsed_ms: number;
  eta_secs: number | null;
  next_batch_in_ms: number;
}

interface PrefetchSummary {
  processed: number;
  fetched: number;
  skipped: number;
  cancelled: boolean;
}

interface Props {
  animeIds: number[];
  onClose: () => void;
}

function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export default function PrefetchRelationsModal({ animeIds, onClose }: Props) {
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState<PrefetchSummary | null>(null);
  const [progress, setProgress] = useState<PrefetchProgressPayload | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [log]);

  const start = async () => {
    if (running) return;
    setRunning(true);
    setFinished(null);
    setError(null);
    setProgress(null);
    setLog([]);

    const unlistenPromise = listen<PrefetchProgressPayload>(
      "anilist-prefetch-progress",
      (e) => {
        const p = e.payload;
        setProgress(p);
        setLog((prev) => {
          const lines: string[] = [];
          for (const item of p.items) {
            if (item.relations.length === 0) {
              lines.push(`${item.title} → (нет связей)`);
            } else {
              for (const r of item.relations) {
                lines.push(`${item.title} → ${r}`);
              }
            }
          }
          return [...prev, ...lines];
        });
      },
    );

    try {
      // Collect unique anime ids for the prefetch
      const result = await invoke<PrefetchSummary>("prefetch_anime_relations", {
        animeIds: [...new Set(animeIds)],
      });
      setFinished(result);
    } catch (err) {
      setError(typeof err === "string" ? err : String(err));
    } finally {
      const unlisten = await unlistenPromise;
      unlisten();
      setRunning(false);
    }
  };

  const cancel = async () => {
    try {
      await invoke("cancel_anime_prefetch");
    } catch {}
  };

  return (
    <Modal header="Предзагрузка связей" onClose={onClose}>
      <div className="flex flex-col gap-2 w-94 max-w-full">
        <p className="windows95-text text-[10px] text-muted">
          Загрузит связи для всех аниме из вашего списка
        </p>

        {!running && !finished && !error && (
          <Button onClick={start} className="w-full">
            Начать предзагрузку
          </Button>
        )}

        {running && progress && (
          <div className="flex flex-col gap-1">
            <ProgressBar value={progress.done} max={progress.total} />
            <div className="flex flex-row items-center justify-between windows95-text text-[10px]">
              <span>
                Готово: {progress.done} / {progress.total}
              </span>
              <span>Осталось: {progress.remaining}</span>
            </div>
            <div className="windows95-text text-[10px] text-muted">
              Загружено новых: {progress.fetched} · Пропущено (кэш):{" "}
              {progress.skipped}
              {progress.current && (
                <>
                  {" "}
                  · Сейчас: <strong>{progress.current}</strong>
                </>
              )}
            </div>
            <div className="flex flex-row items-center justify-between windows95-text text-[10px] text-muted">
              <span>Время: {formatDuration(progress.elapsed_ms / 1000)}</span>
              <span>
                Осталось : ~{" "}
                {progress.eta_secs != null
                  ? formatDuration(progress.eta_secs)
                  : "…"}
              </span>
              <span>
                Следующий запрос через:{" "}
                {(progress.next_batch_in_ms / 1000).toFixed(1)}с
              </span>
            </div>
          </div>
        )}

        {finished && (
          <div className="flex flex-col gap-1 windows95-text text-[10px]">
            <span>
              {finished.cancelled
                ? "Предзагрузка отменена пользователем."
                : "Предзагрузка завершена."}
            </span>
            <span>
              Обработано: {finished.processed} · Загружено новых:{" "}
              {finished.fetched} · Пропущено (кэш): {finished.skipped}
            </span>
          </div>
        )}

        {error && (
          <span className="windows95-text text-[10px] text-destructive">
            Ошибка: {error}
          </span>
        )}

        {(log.length > 0 || running) && (
          <div className="flex flex-col gap-1">
            {running && (
              <div className="flex flex-row gap-1">
                <Button
                  onClick={cancel}
                  variant="error"
                  className="px-2 py-0.5 text-[10px] h-auto"
                >
                  Остановить
                </Button>
              </div>
            )}
            <div
              ref={logRef}
              className="windows95-border bg-white p-1 h-40 overflow-y-auto text-[10px] leading-tight windows95-text whitespace-pre-wrap wrap-break-word"
            >
              {log.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          </div>
        )}

        {finished && (
          <Button onClick={onClose} className="w-full">
            Закрыть
          </Button>
        )}
      </div>
    </Modal>
  );
}
