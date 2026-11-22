import { useMemo } from "react";
import { useI18n } from "@/hooks/i18n.hook";
import { useTorrents } from "@/hooks/torrent/queries.hook";
import { isCurrentDownload } from "@/lib/torrent/torrentCommon.utils";

export function DownloadsStatus() {
  const { t } = useI18n();
  const { data: torrents = [] } = useTorrents();
  const activeDownloads = useMemo(
    () => torrents.reduce((n, torrent) => n + (isCurrentDownload(torrent) ? 1 : 0), 0),
    [torrents]
  );

  return (
    <div className="ui-statusbar-cell">{t("status.downloads", { count: activeDownloads })}</div>
  );
}
