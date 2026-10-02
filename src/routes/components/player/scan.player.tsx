import ProgressBar from "@/components/shared/progress.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { ScanPlayerProps as Props } from "@/types/player";

export default function FolderScanProgress({ scanProgress }: Props) {
  const { t } = useI18n();
  if (!scanProgress) return null;

  return (
    <section className="windows95-active-border windows95-text flex w-full flex-col items-stretch gap-1 px-1 py-1">
      <span>
        {scanProgress.total === 0
          ? t("player.scan.counting")
          : t("player.scan.scanning", {
              current: scanProgress.current,
              total: scanProgress.total,
            })}
      </span>
      {scanProgress.total > 0 && (
        <div className="flex flex-row items-center gap-1">
          <ProgressBar
            value={scanProgress.current}
            max={scanProgress.total}
            className="h-4 flex-1"
          />
          <span className="shrink-0 text-xs">
            {Math.round((scanProgress.current / scanProgress.total) * 100)}%
          </span>
        </div>
      )}
    </section>
  );
}
