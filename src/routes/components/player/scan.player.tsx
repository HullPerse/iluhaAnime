import { useI18n } from "@/lib/i18n";
import type { ScanType } from "@/types";

interface Props {
  scanProgress: ScanType;
}

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
          <div className="windows95-border h-4 flex-1 bg-white">
            <div
              className="bg-secondary h-full"
              style={{
                width: `${(scanProgress.current / scanProgress.total) * 100}%`,
                transition: "none",
              }}
            />
          </div>
          <span className="shrink-0 text-[10px]">
            {Math.round((scanProgress.current / scanProgress.total) * 100)}%
          </span>
        </div>
      )}
    </section>
  );
}
