import { useEffect, useState } from "react";

import { useI18n } from "@/lib/i18n";
import { useTorrentStore } from "@/store/download.store";
import { useNotificationStore } from "@/store/notification.store";
import type { TorrentInfo } from "@/types/torrent";

function isCurrentDownload(torrent: TorrentInfo): boolean {
  return (
    !torrent.finished && torrent.state !== "paused" && torrent.state !== "error"
  );
}

/** Win95 window-frame status bar: active tab, downloads, unread, connectivity. */
export default function StatusBar({ tabLabel }: { tabLabel: string }) {
  const { t } = useI18n();
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Selector returns a primitive, so per-second torrent refreshes only
  // re-render the bar when the active download count actually changes.
  const activeDownloads = useTorrentStore((s) =>
    s.torrents.reduce(
      (n, torrent) => n + (isCurrentDownload(torrent) ? 1 : 0),
      0
    )
  );
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  return (
    <div className="ui-statusbar shrink-0">
      <div className="ui-statusbar-cell flex-1 truncate">
        <span className="truncate">{tabLabel}</span>
      </div>
      <div className="ui-statusbar-cell">
        {t("status.downloads", { count: activeDownloads })}
      </div>
      <div className="ui-statusbar-cell">
        {t("status.unread", { count: unreadCount })}
      </div>
      <div className="ui-statusbar-cell">
        {online ? t("status.online") : t("status.offline")}
      </div>
    </div>
  );
}
