import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";

import { PROJECT_GITHUB_URL } from "@/config/settings/links.config";
import { useTorrents } from "@/hooks/torrent/queries.hook";
import { useI18n } from "@/lib/locale/i18n.utils";
import { isCurrentDownload } from "@/lib/torrent/common.utils";
import { useNotificationStore } from "@/store/notification.store";

import ImageComponent from "../ui/image.component";

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

  const { data: torrents = [] } = useTorrents();
  const activeDownloads = torrents.reduce(
    (n, torrent) => n + (isCurrentDownload(torrent) ? 1 : 0),
    0
  );
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  return (
    <section className="ui-statusbar shrink-0">
      <div className="ui-statusbar-cell flex-1 truncate">
        <span className="truncate">{tabLabel}</span>
      </div>
      <div className="ui-statusbar-cell">{t("status.downloads", { count: activeDownloads })}</div>
      <div className="ui-statusbar-cell">{t("status.unread", { count: unreadCount })}</div>
      <div className="ui-statusbar-cell">{online ? t("status.online") : t("status.offline")}</div>
      <div className="ui-statusbar-cell">
        <ImageComponent
          title={t("status.github")}
          src="https://github.com/favicon.ico"
          alt="github link"
          className="h-4 w-4 opacity-70 hover:cursor-pointer hover:opacity-100"
          onClick={() => openUrl(PROJECT_GITHUB_URL)}
        />
      </div>
    </section>
  );
}
