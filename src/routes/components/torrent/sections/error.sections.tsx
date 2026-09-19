import { FileWarning, RefreshCw } from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";

/**
 * The row under a torrent that has a problem. Recheck is the plain button because it fixes
 * most cases without losing anything; recreating removes the torrent and adds it back by
 * magnet, which drops manual trackers, the file selection and the priorities, so it asks first.
 */
export function TorrentProblem({
  error,
  missing,
  onRecheck,
  onRecreate,
}: {
  error: string | null;
  missing: boolean;
  onRecheck: () => void;
  onRecreate: () => void;
}) {
  const { t } = useI18n();
  const [pendingRecreate, setPendingRecreate] = useState(false);
  return (
    <div className="mt-1 flex items-start gap-1">
      <div className="flex min-w-0 flex-col">
        {missing && (
          <span className="windows95-font text-torrent-missing flex items-center gap-1 text-xs">
            <FileWarning className="size-3 shrink-0" />
            {t("torrent.problem.missing")}
          </span>
        )}
        {error !== null && error !== "" && (
          <span className="text-destructive windows95-font truncate text-xs" title={error}>
            {error}
          </span>
        )}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <Button className="windows95-text text-xs" onClick={onRecheck}>
          {t("torrent.recheck")}
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-4"
          title={t("torrent.recreate")}
          aria-label={t("torrent.recreate")}
          onClick={() => setPendingRecreate(true)}
        >
          <RefreshCw className="size-3" />
        </Button>
      </div>
      {pendingRecreate && (
        <ConfirmDialog
          open
          title={t("torrent.recreate.title")}
          message={t("torrent.recreate.message")}
          confirmLabel={t("torrent.recreate.confirm")}
          variant="destructive"
          onConfirm={() => {
            onRecreate();
            setPendingRecreate(false);
          }}
          onCancel={() => setPendingRecreate(false)}
          onClose={() => setPendingRecreate(false)}
        />
      )}
    </div>
  );
}
