import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink } from "lucide-react";

import { PROJECT_GITHUB_URL } from "@/config/settings/links.config";
import { useOnlineStatus } from "@/hooks/network.hook";
import { useTorrents } from "@/hooks/torrent/queries.hook";
import { useI18n } from "@/lib/locale/i18n.utils";
import { isCurrentDownload } from "@/lib/torrent/common.utils";
import { useNotificationStore } from "@/store/notification.store";

export default function StatusBar({ tabLabel }: { tabLabel: string }) {
  const { t } = useI18n();
  const online = useOnlineStatus();

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
        <span
          title={t("status.github")}
          className="flex items-center hover:cursor-pointer"
          onClick={() => openUrl(PROJECT_GITHUB_URL)}
        >
          <ExternalLink
            aria-label={t("status.github")}
            className="h-4 w-4 opacity-70 hover:opacity-100"
          />
        </span>
      </div>
    </section>
  );
}
