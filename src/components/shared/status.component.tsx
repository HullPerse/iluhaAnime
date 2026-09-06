import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";

import { useI18n } from "@/lib/locale/i18n.utils";
import { isCurrentDownload } from "@/lib/torrent/common.utils";
import { useTorrentStore } from "@/store/download.store";
import { useJobsStore } from "@/store/jobs.store";
import { useNotificationStore } from "@/store/notification.store";
import { useUpscaleQueueStore } from "@/store/upscale.store";

const PROJECT_GITHUB_URL = "https://github.com/HullPerse/iluhaAnime";
const AUTHOR_GITHUB_URL = "https://github.com/HullPerse";

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

  const activeDownloads = useTorrentStore((s) =>
    s.torrents.reduce((n, torrent) => n + (isCurrentDownload(torrent) ? 1 : 0), 0)
  );
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const manualRunning = useJobsStore((s) =>
    Object.values(s.jobs).reduce((n, job) => n + (job.status === "running" ? 1 : 0), 0)
  );
  const upscaleRunning = useUpscaleQueueStore((s) =>
    s.items.reduce((n, item) => n + (item.status === "done" ? 0 : 1), 0)
  );
  const toggleJobs = useJobsStore((s) => s.setPanelOpen);
  const jobsOpen = useJobsStore((s) => s.panelOpen);

  return (
    <div className="ui-statusbar shrink-0">
      <div className="ui-statusbar-cell flex-1 truncate">
        <span className="truncate">{tabLabel}</span>
      </div>
      <div className="ui-statusbar-cell">{t("status.downloads", { count: activeDownloads })}</div>
      <div className="ui-statusbar-cell">
        <button
          type="button"
          className="cursor-pointer truncate underline"
          onClick={() => toggleJobs(!jobsOpen)}
        >
          {t("jobs.title")}: {manualRunning + upscaleRunning}
        </button>
      </div>
      <div className="ui-statusbar-cell">{t("status.unread", { count: unreadCount })}</div>
      <div className="ui-statusbar-cell">{online ? t("status.online") : t("status.offline")}</div>
      <div className="ui-statusbar-cell">
        <button
          type="button"
          className="cursor-pointer truncate text-blue-800 underline"
          title={PROJECT_GITHUB_URL}
          onClick={() =>
            openUrl(PROJECT_GITHUB_URL).catch((error) => console.warn("openUrl failed", error))
          }
        >
          iluhaAnime
        </button>
      </div>
      <div className="ui-statusbar-cell">
        <button
          type="button"
          className="cursor-pointer truncate text-blue-800 underline"
          title={AUTHOR_GITHUB_URL}
          onClick={() =>
            openUrl(AUTHOR_GITHUB_URL).catch((error) => console.warn("openUrl failed", error))
          }
        >
          HullPerse
        </button>
      </div>
    </div>
  );
}
