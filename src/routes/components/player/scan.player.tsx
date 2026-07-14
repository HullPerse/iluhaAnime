import type { ScanType } from "@/types";

interface Props {
  scanProgress: ScanType;
}

export default function FolderScanProgress({ scanProgress }: Props) {
  if (!scanProgress) return null;

  return (
    <section className="flex flex-col windows95-active-border w-full items-stretch windows95-text gap-1 px-1 py-1">
      <span>
        {scanProgress.total === 0
          ? "Подсчёт файлов..."
          : `Сканирование... ${scanProgress.current} / ${scanProgress.total}`}
      </span>
      {scanProgress.total > 0 && (
        <div className="flex flex-row items-center gap-1">
          <div className="flex-1 h-4 windows95-border bg-white">
            <div
              className="h-full bg-secondary"
              style={{
                width: `${(scanProgress.current / scanProgress.total) * 100}%`,
                transition: "none",
              }}
            />
          </div>
          <span className="text-[10px] shrink-0">
            {Math.round((scanProgress.current / scanProgress.total) * 100)}%
          </span>
        </div>
      )}
    </section>
  );
}
