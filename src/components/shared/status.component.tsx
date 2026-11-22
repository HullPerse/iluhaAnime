import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink } from "lucide-react";
import { PROJECT_GITHUB_URL } from "@/config/system/links.config";
import { useI18n } from "@/hooks/i18n.hook";
import { useOnlineStatus } from "@/hooks/network.hook";
import { useCell } from "@hullperse/hp_utils/react";
import { notificationAtoms } from "@/store/notification.store";
import { vimAtoms } from "@/store/vim.store";
import { DownloadsStatus } from "@/components/shared/shell/downloadsStatus.shell";

export default function StatusBar({ tabLabel }: { tabLabel: string }) {
  const { t } = useI18n();
  const online = useOnlineStatus();
  const unreadCount = useCell(notificationAtoms.unreadCount);
  const vimCount = useCell(vimAtoms.count);

  return (
    <section className="ui-statusbar shrink-0">
      <div className="ui-statusbar-cell flex-1 truncate">
        <span className="truncate">{tabLabel}</span>
      </div>
      {vimCount !== "" && <div className="ui-statusbar-cell tabular-nums">{vimCount}</div>}
      <DownloadsStatus />
      <div className="ui-statusbar-cell">{t("status.unread", { count: unreadCount })}</div>
      <div className="ui-statusbar-cell">{online ? t("status.online") : t("status.offline")}</div>
      <div className="ui-statusbar-cell">
        <button
          type="button"
          title={t("status.github")}
          aria-label={t("status.github")}
          data-vim-target="status-link"
          className="flex cursor-pointer items-center"
          onClick={() => openUrl(PROJECT_GITHUB_URL)}
        >
          <ExternalLink aria-hidden className="h-4 w-4 opacity-70 hover:opacity-100" />
        </button>
      </div>
    </section>
  );
}
