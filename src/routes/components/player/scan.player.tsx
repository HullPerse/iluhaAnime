import ProgressBar from "@/components/shared/progress.component";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { ScanType } from "@/types/player/player";

export default function FolderScanProgress({ scan }: { scan: ScanType }) {
  const { t } = useI18n();
  const title = t("player.scan.title");
  const folder = scan.type === "folder";
  const status = folder
    ? scan.walked > 0
      ? t("player.scan.walked", { count: scan.walked })
      : t("player.scan.counting")
    : t("player.scan.folders", { current: scan.current, total: scan.total });

  return (
    <section className="ui-panel windows95-text flex w-full flex-col gap-1 px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <ImageComponent src="/images/w2k_folder_closed.ico" alt="" className="size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-bold">{title}</div>
          {folder && (
            <div className="text-hint truncate text-xs" title={scan.path}>
              {scan.path}
            </div>
          )}
        </div>
        <span className="text-hint ml-auto shrink-0 text-xs tabular-nums" role="status">
          {status}
        </span>
      </div>
      <ProgressBar
        value={folder ? 0 : scan.current}
        max={folder ? 0 : scan.total}
        indeterminate={folder}
        ariaLabel={title}
        className="h-3 w-full"
      />
    </section>
  );
}
